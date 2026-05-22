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
const DEBOUNCE_MS = 500;

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
  // browser exposes. visibilitychange catches tab switches + mobile
  // backgrounding; pagehide catches Safari navigation; beforeunload
  // catches desktop close / refresh. Belt-and-braces redundancy.
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden' && timer) flush();
  };
  const onPageHide = () => { if (timer) flush(); };
  const onBeforeUnload = () => { if (timer) flush(); };

  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('beforeunload', onBeforeUnload);

  return () => {
    unsub();
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
