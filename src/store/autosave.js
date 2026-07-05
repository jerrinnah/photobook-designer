// Autosave to IndexedDB with debounce. Survives tab refresh / accidental close.
// IndexedDB has a quota of ~50% of available disk space (vs localStorage's 5 MB)
// so the entire project — spreads + photos including originalSrc — fits.
//
// To migrate users seamlessly from the old localStorage-based autosave,
// loadAutosave() falls back to localStorage on first run, then writes
// to IndexedDB going forward.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  getActiveProjectId, saveProject as saveProjectBlob,
  upsertIndexEntry, migrateLegacyAutosave, loadProject as loadProjectBlob,
} from './projects';

const KEY = 'photobook-autosave-v2';
const META_KEY = 'photobook-autosave-meta-v2';
const LEGACY_KEY = 'photobook-autosave-v1';
const LEGACY_META = 'photobook-autosave-meta-v1';
// Synchronous emergency snapshot key. Written to localStorage during
// visibility-hidden / beforeunload — guaranteed to land before the
// browser tears down the tab. IndexedDB writes are async and may not
// complete during page teardown, so this is the belt to IDB's braces.
const EMERGENCY_KEY = 'photobook-emergency-snapshot-v1';
const DEBOUNCE_MS = 250; // was 500 — halved so less can be lost between edits and unload

let timer = null;
let lastStatus = 'idle'; // 'idle' | 'saving' | 'saved' | 'error'
let listeners = new Set();
let lastMeta = null;
// Exposed module-level flush so explicit callers (signOut, etc.) can
// guarantee the latest state hits IDB before navigating away.
let _flushFn = null;

const notify = (status, extra) => {
  lastStatus = status;
  if (extra) lastMeta = extra;
  for (const l of listeners) l(status, extra || lastMeta);
};

export const subscribeAutosaveStatus = (fn) => {
  listeners.add(fn);
  fn(lastStatus, lastMeta);
  return () => listeners.delete(fn);
};

const buildSnapshot = (state) => ({
  v: 2,
  savedAt: Date.now(),
  bookName: state.bookName,
  spreadSizeId: state.spreadSizeId,
  customSize: state.customSize,
  gap: state.gap,
  blendEdges: state.blendEdges,
  spreads: state.spreads,
  photos: state.photos,
});

// Compact snapshot for the emergency localStorage backup. Strips the
// base64 photo blobs (photos.src / photos.originalSrc) because those
// are big and would blow past localStorage's ~5MB limit. Layout,
// captions, and photo metadata (name, dimensions, batch info) are
// preserved. On recovery, we merge these back with the last IDB save's
// photo blobs so no design work is lost.
const buildEmergencySnapshot = (state, activeProjectId) => ({
  v: 1,
  savedAt: Date.now(),
  activeProjectId,
  bookName: state.bookName,
  spreadSizeId: state.spreadSizeId,
  customSize: state.customSize,
  gap: state.gap,
  blendEdges: state.blendEdges,
  spreads: state.spreads,
  // Photo metadata only — no base64. Enough to know which slots are
  // filled and to re-associate them with cached photo blobs from IDB.
  photoMeta: (state.photos || []).map((p) => ({
    id: p.id, name: p.name, width: p.width, height: p.height,
    origWidth: p.origWidth, origHeight: p.origHeight,
    favorite: p.favorite || false,
    facePriority: p.facePriority || 0,
    batchId: p.batchId, batchLabel: p.batchLabel, batchAt: p.batchAt,
    shotAt: p.shotAt,
  })),
});

const writeEmergencySnapshot = (state) => {
  try {
    const activeId = getActiveProjectId();
    const snap = buildEmergencySnapshot(state, activeId);
    // JSON.stringify + setItem is fully synchronous — completes before
    // the browser can unload the tab. This is the whole point.
    localStorage.setItem(EMERGENCY_KEY, JSON.stringify(snap));
  } catch (e) {
    // QuotaExceededError on very large layouts is the only realistic
    // failure. Nothing else to do — IDB is still the primary save.
    console.info('[autosave] emergency snapshot skipped:', e?.message);
  }
};

const clearEmergencySnapshot = () => {
  try { localStorage.removeItem(EMERGENCY_KEY); } catch { /* ignore */ }
};

export const readEmergencySnapshot = () => {
  try {
    const raw = localStorage.getItem(EMERGENCY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

// Exported for the boot-time recovery in preloadAutosave.
export { clearEmergencySnapshot };

const writeIDB = async (state) => {
  const snap = buildSnapshot(state);
  try {
    const activeId = getActiveProjectId();
    if (activeId) {
      // Multi-project mode: save to the per-project blob + update index
      await saveProjectBlob(activeId, snap);
      await upsertIndexEntry({
        id: activeId,
        name: snap.bookName || 'Untitled',
        savedAt: snap.savedAt,
        photoCount: (snap.photos || []).length,
        spreadCount: (snap.spreads || []).length,
      });
    } else {
      // Legacy single-project mode
      await idbSet(KEY, snap);
    }
    const bytes = estimateBytes(snap);
    const meta = { savedAt: snap.savedAt, bytes };
    await idbSet(META_KEY, meta);
    notify('saved', meta);
  } catch (e) {
    notify('error', { message: e?.message || 'autosave failed' });
  }
};

// Rough byte estimate without serializing twice (IDB stores native objects,
// but base64 photo strings still dominate so length × 2 is a fine heuristic).
const estimateBytes = (obj) => {
  try {
    let n = 0;
    for (const p of obj.photos || []) {
      n += (p.src?.length || 0) + (p.originalSrc?.length || 0);
    }
    return n;
  } catch {
    return 0;
  }
};

export const startAutosave = (store) => {
  const trigger = () => {
    if (timer) clearTimeout(timer);
    notify('saving');
    timer = setTimeout(() => {
      writeIDB(store.getState());
      timer = null;
    }, DEBOUNCE_MS);
  };

  // Subscribe to the slice of state that should trigger a save
  const unsub = store.subscribe((s, prev) => {
    if (
      s.spreads !== prev.spreads ||
      s.photos !== prev.photos ||
      s.bookName !== prev.bookName ||
      s.spreadSizeId !== prev.spreadSizeId ||
      s.customSize !== prev.customSize ||
      s.gap !== prev.gap ||
      s.blendEdges !== prev.blendEdges
    ) trigger();
  });

  // Awaitable flush — cancels any pending debounce timer and writes
  // synchronously so callers (signOut, explicit flushAutosave) can be
  // sure nothing is in flight before they navigate away.
  const flush = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    try { await writeIDB(store.getState()); } catch { /* notify already reported */ }
  };
  _flushFn = flush;

  // Save signals — fire on every "user might be leaving" event the
  // browser exposes. Two-layer protection:
  //   1) fire the async IDB flush (may or may not complete)
  //   2) fire the SYNCHRONOUS emergency snapshot to localStorage
  //      (guaranteed to complete before teardown — this is what
  //      actually rescues the last few edits from a refresh)
  const emergencyBackup = () => {
    try { writeEmergencySnapshot(store.getState()); } catch { /* non-fatal */ }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      emergencyBackup();
      if (timer) flush();
    }
  };
  const onPageHide = () => {
    emergencyBackup();
    if (timer) flush();
  };
  const onBeforeUnload = () => {
    emergencyBackup();
    if (timer) flush();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  // Heartbeat autosave — every 15s, force a write if the state has
  // changed since the last save. Halved from 30s so long design
  // sessions (where the debounce keeps getting reset by continuous
  // edits) never leave a gap wider than a quarter-minute. The write
  // itself is skipped if a debounce timer is imminent (no double-write
  // within 250ms).
  //
  // Also refreshes the emergency snapshot so it stays close to live —
  // an unexpected browser crash mid-heartbeat still has an at-most-
  // 15-second-old snapshot to rescue.
  let lastHeartbeatState = null;
  const heartbeat = setInterval(() => {
    const s = store.getState();
    const sig = { spreads: s.spreads, photos: s.photos };
    if (lastHeartbeatState
        && lastHeartbeatState.spreads === sig.spreads
        && lastHeartbeatState.photos === sig.photos) return;
    if (timer) return; // debounce will fire imminently
    lastHeartbeatState = sig;
    writeIDB(s);
    writeEmergencySnapshot(s);
  }, 15_000);

  return () => {
    unsub();
    clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('beforeunload', onBeforeUnload);
    _flushFn = null;
  };
};

// Explicit synchronous flush for callers that want to make absolutely
// sure pending state has hit IDB before they navigate (e.g. signOut).
// Safe to call when no autosave is registered — resolves immediately.
export async function flushAutosave() {
  if (_flushFn) {
    try { await _flushFn(); } catch { /* ignore */ }
  }
}

// ── Loading ─────────────────────────────────────────────────────────
// SYNCHRONOUS — called from useBookStore's initial state factory before
// the IndexedDB read can complete. Returns whatever was last cached in
// memory or null. The async restore (below) hydrates the store on mount.
export const loadAutosave = () => _cachedRestore;
let _cachedRestore = null;

// Called once on app startup before the store initializes. Loads from
// IndexedDB. Performs the legacy-localStorage migration on first run and
// the legacy-single-project → multi-project migration on first run.
export async function preloadAutosave() {
  try {
    // 1) Pull legacy localStorage data into IDB if present
    let data = await idbGet(KEY);
    if (!data) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        try {
          data = JSON.parse(legacy);
          await idbSet(KEY, data);
          localStorage.removeItem(LEGACY_KEY);
          localStorage.removeItem(LEGACY_META);
        } catch { /* corrupt legacy — ignore */ }
      }
    }

    // 2) Migrate single-project IDB into multi-project structure
    await migrateLegacyAutosave();

    // 3) Load whichever project is active (multi-project mode), or the
    //    legacy single-project blob if the user hasn't picked one yet.
    const activeId = getActiveProjectId();
    if (activeId) {
      _cachedRestore = await loadProjectBlob(activeId);
    } else {
      _cachedRestore = data || null;
    }

    if (_cachedRestore) {
      const meta = await idbGet(META_KEY);
      if (meta) lastMeta = meta;
    }

    // 4) Emergency-snapshot recovery. Runs AFTER we've loaded whatever
    //    IDB knows about. If a synchronous emergency snapshot was
    //    written on the last visibility-hidden / pagehide / beforeunload
    //    AND it's newer than what IDB has, the browser tore down before
    //    the async IDB write committed — restore the emergency layout
    //    but keep the photo blobs from IDB (matched by photoId).
    const emergency = readEmergencySnapshot();
    if (emergency && emergency.savedAt) {
      const idbSavedAt = _cachedRestore?.savedAt || 0;
      const isNewer = emergency.savedAt > idbSavedAt + 1_000; // 1s slack for clock jitter
      const sameProject = !activeId || emergency.activeProjectId === activeId;
      if (isNewer && sameProject) {
        // Build a photoId → full-photo lookup from whatever IDB had.
        const idbPhotos = _cachedRestore?.photos || [];
        const photoById = new Map(idbPhotos.map((p) => [String(p.id), p]));
        const rebuiltPhotos = (emergency.photoMeta || []).map((meta) => {
          const idbCopy = photoById.get(String(meta.id));
          // Merge: emergency meta wins for lightweight fields, IDB blob
          // wins for the actual base64 src / originalSrc. If IDB had no
          // record of this photo (rare), we keep just the meta — the
          // cell will render an "image missing" state and the user can
          // re-import that one.
          return {
            ...(idbCopy || {}),
            ...meta,
            src: idbCopy?.src,
            originalSrc: idbCopy?.originalSrc,
          };
        });
        _cachedRestore = {
          v: 2,
          savedAt: emergency.savedAt,
          bookName: emergency.bookName,
          spreadSizeId: emergency.spreadSizeId,
          customSize: emergency.customSize,
          gap: emergency.gap,
          blendEdges: emergency.blendEdges,
          spreads: emergency.spreads,
          photos: rebuiltPhotos,
        };
        lastMeta = { savedAt: emergency.savedAt, bytes: estimateBytes(_cachedRestore), recovered: true };
        console.info('[autosave] recovered from emergency snapshot — layout newer than IDB by',
          Math.round((emergency.savedAt - idbSavedAt) / 1000), 's');
      }
    }
    // Whether we recovered or not, clear the emergency snapshot now
    // that it's been either used or superseded by IDB.
    clearEmergencySnapshot();
  } catch {
    _cachedRestore = null;
  }
}

// Switch the active project — call from the project picker. Causes a
// full app reload so the store re-initializes with the new project's data.
export async function switchToProject(projectId) {
  const { setActiveProjectId } = await import('./projects');
  setActiveProjectId(projectId);
  window.location.reload();
}

export const clearAutosave = async () => {
  try {
    await idbDel(KEY);
    await idbDel(META_KEY);
  } catch { /* ignore */ }
  _cachedRestore = null;
  lastMeta = null;
  notify('idle');
};

export const getAutosaveMeta = () => lastMeta;
