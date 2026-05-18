// Autosave to IndexedDB with debounce. Survives tab refresh / accidental close.
// IndexedDB has a quota of ~50% of available disk space (vs localStorage's 5 MB)
// so the entire project — spreads + photos including originalSrc — fits.
//
// To migrate users seamlessly from the old localStorage-based autosave,
// loadAutosave() falls back to localStorage on first run, then writes
// to IndexedDB going forward.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const KEY = 'photobook-autosave-v2';
const META_KEY = 'photobook-autosave-meta-v2';
const LEGACY_KEY = 'photobook-autosave-v1';
const LEGACY_META = 'photobook-autosave-meta-v1';
const DEBOUNCE_MS = 1500;

let timer = null;
let lastStatus = 'idle'; // 'idle' | 'saving' | 'saved' | 'error'
let listeners = new Set();
let lastMeta = null;

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
    await idbSet(KEY, snap);
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

  // Flush on tab close — best-effort, browsers may not wait on async writes.
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      writeIDB(store.getState());
    }
  };
  window.addEventListener('beforeunload', flush);

  return () => {
    unsub();
    window.removeEventListener('beforeunload', flush);
  };
};

// ── Loading ─────────────────────────────────────────────────────────
// SYNCHRONOUS — called from useBookStore's initial state factory before
// the IndexedDB read can complete. Returns whatever was last cached in
// memory or null. The async restore (below) hydrates the store on mount.
export const loadAutosave = () => _cachedRestore;
let _cachedRestore = null;

// Called once on app startup before the store initializes. Loads from
// IndexedDB (or migrates from legacy localStorage on first run).
export async function preloadAutosave() {
  try {
    let data = await idbGet(KEY);
    if (!data) {
      // First run after migration — pull from old localStorage if present
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        try {
          data = JSON.parse(legacy);
          await idbSet(KEY, data);  // copy into IDB for next time
          localStorage.removeItem(LEGACY_KEY);
          localStorage.removeItem(LEGACY_META);
        } catch { /* corrupt legacy data — ignore */ }
      }
    }
    _cachedRestore = data || null;
    if (data) {
      const meta = await idbGet(META_KEY);
      if (meta) lastMeta = meta;
    }
  } catch {
    _cachedRestore = null;
  }
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
