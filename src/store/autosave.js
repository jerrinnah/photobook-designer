// Autosave to localStorage with debounce. Survives tab refresh / accidental close.
// Photos are stored as base64 in state, so we guard for QuotaExceededError and
// fall back to saving the spread structure only when the full project is too large.

const KEY = 'photobook-autosave-v1';
const META_KEY = 'photobook-autosave-meta-v1';
const DEBOUNCE_MS = 1500;
const MAX_BYTES = 4_500_000; // ~4.5 MB — most browsers cap localStorage at 5–10 MB

let timer = null;
let lastStatus = 'idle'; // 'idle' | 'saving' | 'saved' | 'error' | 'too-large'
let listeners = new Set();

const notify = (status, extra) => {
  lastStatus = status;
  for (const l of listeners) l(status, extra);
};

export const subscribeAutosaveStatus = (fn) => {
  listeners.add(fn);
  fn(lastStatus, null);
  return () => listeners.delete(fn);
};

const serialize = (state) => JSON.stringify({
  v: 1,
  savedAt: Date.now(),
  bookName: state.bookName,
  spreadSizeId: state.spreadSizeId,
  customSize: state.customSize,
  gap: state.gap,
  blendEdges: state.blendEdges,
  spreads: state.spreads,
  photos: state.photos,
});

const writeOrFallback = (state) => {
  const full = serialize(state);
  try {
    if (full.length > MAX_BYTES) throw new Error('too-large');
    localStorage.setItem(KEY, full);
    localStorage.setItem(META_KEY, JSON.stringify({ savedAt: Date.now(), bytes: full.length, partial: false }));
    notify('saved', { savedAt: Date.now(), bytes: full.length, partial: false });
  } catch (e) {
    // Quota exceeded or too big — save structure only (no photo base64)
    try {
      const partial = JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        bookName: state.bookName,
        spreadSizeId: state.spreadSizeId,
        customSize: state.customSize,
        gap: state.gap,
        blendEdges: state.blendEdges,
        spreads: state.spreads,
        photos: [], // dropped — too large
      });
      localStorage.setItem(KEY, partial);
      localStorage.setItem(META_KEY, JSON.stringify({ savedAt: Date.now(), bytes: partial.length, partial: true }));
      notify('too-large', { savedAt: Date.now(), bytes: partial.length, partial: true });
    } catch (e2) {
      notify('error', { message: e2?.message || 'autosave failed' });
    }
  }
};

export const startAutosave = (store) => {
  const trigger = () => {
    if (timer) clearTimeout(timer);
    notify('saving');
    timer = setTimeout(() => {
      writeOrFallback(store.getState());
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

  // Flush on tab close
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      writeOrFallback(store.getState());
    }
  };
  window.addEventListener('beforeunload', flush);

  return () => {
    unsub();
    window.removeEventListener('beforeunload', flush);
  };
};

export const loadAutosave = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearAutosave = () => {
  localStorage.removeItem(KEY);
  localStorage.removeItem(META_KEY);
  notify('idle');
};

export const getAutosaveMeta = () => {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
