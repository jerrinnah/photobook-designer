import { create } from 'zustand';
import { TEMPLATES } from '../layouts/templates';
import { getScreenDims } from '../layouts/spreadSizes';
import { loadAutosave, clearAutosave } from './autosave';

const round4 = (n) => Math.round(n * 10000) / 10000;

const naturalSort = (arr) =>
  [...arr].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

// Same as naturalSort but key-person photos (higher facePriority) come
// first, so auto-design fills early spreads + hero cells with them.
// Within the same priority bucket, natural filename order is preserved.
const facePrioritySort = (arr) =>
  [...arr].sort((a, b) => {
    const fp = (b.facePriority || 0) - (a.facePriority || 0);
    if (Math.abs(fp) > 0.0001) return fp;
    return (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
  });

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Module-level ID counters — reset by loadProject
let photoIdCounter = 1;
let captionIdCounter = 1;

const randomTemplate = () => TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];

// Carry the template cell's hint (aspect family) into the live cell data
const makeCell = (tplCell) => ({
  photoId: null, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, locked: false,
  manualCrop: false,  // true once user zooms / pans / resizes — stops auto-fit
  hint: tplCell?.hint ?? null,
  gradient: null,  // { type, color, opacity } — overlay rendered on top of photo
  effects: null,   // { bw, sepia, blur, brightness, contrast, vignette }
});

const makeSpread = (id, tmpl) => {
  const t = tmpl || randomTemplate();
  return {
    id,
    templateId: t.id,
    cellGeometry: t.cells.map((c) => ({ ...c })),
    cells: t.cells.map((c) => makeCell(c)),
    bgColor: '#ffffff',
    bgMode: 'color',      // 'color' | 'gradient' | 'image'
    bgGradient: null,     // { type:'linear'|'radial'|'vignette', angle, stops:['#000','#222'] }
    bgImage: null,        // base64 data URL
    bgOverlay: null,      // { type:'linear'|'radial'|'vignette', angle, color, opacity } over bgImage
    role: null,           // null | 'cover' | 'back'
    captions: [],
  };
};

// Snapshot for undo/redo — excludes photos (large) and navigation state
const snap = (s) => ({
  spreads: JSON.parse(JSON.stringify(s.spreads)),
  gap: s.gap,
  bookName: s.bookName,
  blendEdges: s.blendEdges,
});

// Wraps a state updater to atomically save history before the mutation
const h = (fn) => (s) => ({
  ...fn(s),
  past: [...s.past.slice(-49), snap(s)],
  future: [],
});

// Photo picker with tiered aspect-ratio matching.
//
// Tier 1 — 80 %+ AR match: photo AR is within ±20 % of the cell's actual AR.
//   This handles standard sizes: 9:16 (0.5625), 4:5 (0.8), 16:9 (1.778).
//   A photo is "80 % match" when:  0.8 ≤ (photoAR / cellAR) ≤ 1.25
//
// Tier 2 — Same orientation (landscape vs portrait, ~60 % match).
// Tier 3 — Any remaining photo.
//
// Within each tier the closest AR wins.
const pickBestPhoto = (pool, cellAspect) => {
  const withIdx = pool
    .map((p, i) => ({ p, i, ar: p.width / p.height }))
    .filter(({ ar }) => isFinite(ar) && ar > 0);

  // Tier 1: within 80 % of cell aspect ratio
  const close = withIdx.filter(({ ar }) => {
    const ratio = ar / cellAspect;
    return ratio >= 0.8 && ratio <= 1.25;
  });

  // Tier 2: matching orientation
  const isLandscapeCell = cellAspect >= 1;
  const oriented = withIdx.filter(({ ar }) => isLandscapeCell ? ar >= 1 : ar < 1);

  // Fall back through tiers; if all photos had invalid AR, use raw pool indices
  const candidates = close.length > 0 ? close : oriented.length > 0 ? oriented : withIdx;
  if (candidates.length === 0) return 0; // last resort: first photo in pool

  let best = candidates[0];
  let bestDiff = Infinity;
  candidates.forEach(({ p, i, ar }) => {
    const diff = Math.abs(ar - cellAspect);
    if (diff < bestDiff) { bestDiff = diff; best = { p, i }; }
  });
  return best.i;
};

// Resize a cell's geometry to exactly match a photo's aspect ratio,
// Computes the cell.offsetY needed so the rendered image's TOP edge
// aligns with the cell's top edge (instead of the default centered crop).
// Positive return value = shift the image up, putting its top at cell top.
// Returns 0 when the image fits exactly (no vertical overflow).
const topAlignOffsetY = (cellGeo, photo, sw, sh) => {
  if (!photo || !cellGeo || !sw || !sh) return 0;
  const cellW = cellGeo.w * sw;
  const cellH = cellGeo.h * sh;
  if (!photo.width || !photo.height || !cellW || !cellH) return 0;
  const scale = Math.max(cellW / photo.width, cellH / photo.height);
  const renderedH = photo.height * scale;
  return (renderedH - cellH) / 2;
};

// Fits the cell's geometry to the photo's aspect ratio so the whole photo
// is visible (no cropping). Used ONLY when the cell hasn't been manually
// modified by the user (see cell.manualCrop). Once the user zooms, pans,
// or resizes a cell, manualCrop becomes true and we stop reshaping it,
// preserving the user's intended layout.
const fitGeoToPhoto = (geo, photoAR, sw, sh) => {
  if (!photoAR || !isFinite(photoAR) || photoAR <= 0 || !sw || !sh) return geo;
  const cellAR = (geo.w * sw) / (geo.h * sh);
  if (!isFinite(cellAR) || cellAR <= 0) return geo;
  const ratio = photoAR / cellAR;
  if (ratio >= 0.85 && ratio <= 1.18) return geo; // already a good fit

  const maxPxW = geo.w * sw;
  const maxPxH = geo.h * sh;
  let fW = maxPxW;
  let fH = fW / photoAR;
  if (fH > maxPxH) { fH = maxPxH; fW = fH * photoAR; }

  const newW = fW / sw;
  const newH = fH / sh;
  if (newW <= 0 || newH <= 0 || !isFinite(newW) || !isFinite(newH)) return geo;
  const newX = geo.x + (geo.w - newW) / 2;
  const newY = geo.y + (geo.h - newH) / 2;
  return { x: round4(newX), y: round4(newY), w: round4(newW), h: round4(newH), hint: geo.hint };
};

// Fraction of cells that are portrait-hinted or portrait-shaped in screen coords
const portraitCellRatio = (tmpl, sw, sh) => {
  const portraitCount = tmpl.cells.filter((c) => {
    if (c.hint === '916' || c.hint === '45') return true;
    return (c.w * sw) / (c.h * sh) < 1;
  }).length;
  return portraitCount / tmpl.cells.length;
};

// Pick a template with at least minCells cells, oriented to match the photo pool
const MIN_CELLS_PER_SPREAD = 18;

// Soft, editorial-friendly gradient palettes used by autoDesignAll.
// Light/warm tones suit wedding & family photobooks; one is picked
// per Design All call and applied to every newly-templated spread for
// a consistent book feel.
const AUTO_DESIGN_GRADIENTS = [
  { name: 'Chalk',     type: 'linear',   angle: 180, stops: ['#f5f2ec', '#dedad2'] },
  { name: 'Ivory',     type: 'linear',   angle: 135, stops: ['#fdfcf8', '#e8e1d2'] },
  { name: 'Sand',      type: 'linear',   angle: 180, stops: ['#f8f0e8', '#d9c8b6'] },
  { name: 'Pearl',     type: 'linear',   angle: 135, stops: ['#f2eee8', '#c8cdd2'] },
  { name: 'Mist',      type: 'linear',   angle: 180, stops: ['#eef2f3', '#c5cdd0'] },
  { name: 'Blush',     type: 'linear',   angle: 180, stops: ['#fbeee7', '#e8c4b8'] },
  { name: 'Sage',      type: 'linear',   angle: 180, stops: ['#eef0e6', '#cbd2bd'] },
  { name: 'Halo',      type: 'vignette', angle: 0,   stops: ['#f5f2ec', '#1a1a1a'] },
  { name: 'Midnight',  type: 'linear',   angle: 180, stops: ['#1e2533', '#05050f'] },
  { name: 'Charcoal',  type: 'linear',   angle: 180, stops: ['#1a1a1a', '#050505'] },
];
const pickAutoGradient = () =>
  AUTO_DESIGN_GRADIENTS[Math.floor(Math.random() * AUTO_DESIGN_GRADIENTS.length)];


const pickHighDensityTemplate = (portraitDominant, sw, sh) => {
  const pool = TEMPLATES.filter((t) => !t.printSize && t.cells.length >= MIN_CELLS_PER_SPREAD);
  const fallback = TEMPLATES.filter((t) => !t.printSize);
  const base = pool.length > 0 ? pool : fallback;
  const scored = base.map((t) => ({ t, ratio: portraitCellRatio(t, sw, sh) }));
  const suited = portraitDominant
    ? scored.filter(({ ratio }) => ratio >= 0.4)
    : scored.filter(({ ratio }) => ratio <= 0.4);
  const candidates = suited.length > 0 ? suited : scored;
  return candidates[Math.floor(Math.random() * candidates.length)].t;
};

// Generic editorial picker — includes Standard and Wedding templates,
// excludes Cover, Event, Print, and the standalone full-bleed/hero ones.
// Cell count is constrained to [minCells, maxCells].
const pickFromPool = (portraitDominant, sw, sh, minCells, maxCells) => {
  const pool = TEMPLATES.filter((t) =>
    !t.printSize &&
    t.category !== 'Cover' &&
    t.category !== 'Event' &&
    t.cells.length >= minCells && t.cells.length <= maxCells
  );
  if (pool.length === 0) return null;
  const scored = pool.map((t) => ({ t, ratio: portraitCellRatio(t, sw, sh) }));
  const suited = portraitDominant
    ? scored.filter(({ ratio }) => ratio >= 0.4)
    : scored.filter(({ ratio }) => ratio <= 0.4);
  const candidates = suited.length > 0 ? suited : scored;
  return candidates[Math.floor(Math.random() * candidates.length)].t;
};

// Spread density grows with index. Wedding + Standard editorial templates
// are both eligible.
const pickProgressiveTemplate = (spreadIdx, portraitDominant, sw, sh) => {
  const target = Math.max(1, Math.min(18, spreadIdx));
  const minCells = Math.max(1, target - 1);
  const maxCells = target + 2;
  return pickFromPool(portraitDominant, sw, sh, minCells, maxCells)
    || pickHighDensityTemplate(portraitDominant, sw, sh);
};

// "Redesign" picker — targets the 3–9 cell editorial sweet spot from the
// wedding photobook reference samples (hero + supporting photos, mosaics,
// diptychs, etc.). Never picks super-dense layouts.
const pickEditorialTemplate = (portraitDominant, sw, sh) => {
  return pickFromPool(portraitDominant, sw, sh, 3, 9)
    || pickHighDensityTemplate(portraitDominant, sw, sh);
};

// Pull autosaved state (if any) from localStorage and use it as initial state.
// Photo IDs are deduped here too — same defensive normalization as loadProject.
// Helper: make sure spreads[0] always has role:'cover'.
// Preserves any Cover-category template the user already picked; falls back
// to 'full-bleed' only when no valid cover template is in place.
const enforceCover = (spreads) => spreads.map((sp, i) => {
  if (i !== 0) return sp;
  const currentTpl = TEMPLATES.find((t) => t.id === sp.templateId);
  if (currentTpl?.category === 'Cover' || currentTpl?.id === 'full-bleed') {
    return { ...sp, role: 'cover' };
  }
  const coverTpl = TEMPLATES.find((t) => t.id === 'full-bleed') || TEMPLATES[0];
  const existingPhotoId = sp.cells?.[0]?.photoId ?? null;
  return {
    ...sp,
    role: 'cover',
    templateId: coverTpl.id,
    cellGeometry: coverTpl.cells.map((c) => ({ ...c })),
    cells: coverTpl.cells.map((c) => ({ ...makeCell(c), photoId: existingPhotoId })),
  };
});

const buildInitialState = () => {
  const saved = loadAutosave();
  const defaults = {
    spreads: enforceCover([
      makeSpread(1, TEMPLATES[0]),
      makeSpread(2, TEMPLATES[2]),
      makeSpread(3, TEMPLATES[10]),
    ]),
    activeSpreadId: 1,
    photos: [],
    spreadSizeId: 'sq-10',
    customSize: { w: 1920, h: 1080 },
    blendEdges: false,
    bookName: 'photobook',
    gap: 3,
  };
  if (!saved) return defaults;

  // Sync ID counters so new photos/captions don't collide with restored IDs
  const maxPhotoId = (saved.photos || []).reduce(
    (max, p) => Math.max(max, parseInt(p.id) || 0), 0
  );
  photoIdCounter = maxPhotoId + 1;
  const allCaptions = (saved.spreads || []).flatMap((sp) => sp.captions || []);
  const maxCapId = allCaptions.reduce(
    (max, c) => Math.max(max, parseInt((c.id || '').replace('cap', '')) || 0), 0
  );
  captionIdCounter = maxCapId + 1;

  // Dedupe photo assignments + enforce cover on spread 0
  const seen = new Set();
  const normalizedSpreads = enforceCover((saved.spreads || defaults.spreads).map((sp) => ({
    ...sp,
    cells: (sp.cells || []).map((c) => {
      if (!c?.photoId) return c;
      if (seen.has(c.photoId)) return { ...c, photoId: null };
      seen.add(c.photoId);
      return c;
    }),
  })));

  return {
    spreads: normalizedSpreads.length ? normalizedSpreads : defaults.spreads,
    activeSpreadId: normalizedSpreads[0]?.id ?? 1,
    photos: saved.photos || [],
    spreadSizeId: saved.spreadSizeId || defaults.spreadSizeId,
    customSize: saved.customSize || defaults.customSize,
    blendEdges: saved.blendEdges ?? defaults.blendEdges,
    bookName: saved.bookName || defaults.bookName,
    gap: saved.gap ?? defaults.gap,
  };
};

export const useBookStore = create((set, get) => ({
  ...buildInitialState(),
  selectedPhotoIds: new Set(),
  repeatedPhotoIds: new Set(),
  selectedCellIndex: null,         // "Primary" cell — drives the floating cell toolbar / panels
  selectedCellIndices: new Set(),  // Full multi-selection (always includes primary when set)
  photoFilter: 'all',   // 'all' | 'used' | 'unused' | 'favorites'
  photoSort: 'name',    // 'name' | 'newest' | 'portrait' | 'landscape'
  photoSearch: '',

  // ── Undo / Redo ────────────────────────────────────────────────────
  past: [],
  future: [],

  undo: () => set((s) => {
    if (s.past.length === 0) return s;
    const prev = s.past[s.past.length - 1];
    const current = snap(s);
    return {
      ...s,
      ...prev,
      past: s.past.slice(0, -1),
      future: [current, ...s.future.slice(0, 49)],
      selectedCellIndex: null,
      selectedCellIndices: new Set(),
    };
  }),

  redo: () => set((s) => {
    if (s.future.length === 0) return s;
    const next = s.future[0];
    const current = snap(s);
    return {
      ...s,
      ...next,
      past: [...s.past, current],
      future: s.future.slice(1),
      selectedCellIndex: null,
      selectedCellIndices: new Set(),
    };
  }),

  // ── ID helpers ─────────────────────────────────────────────────────
  nextPhotoId: () => String(photoIdCounter++),

  // ── Settings ───────────────────────────────────────────────────────
  setActiveSpread: (id) => set({ activeSpreadId: id, selectedCellIndex: null, selectedCellIndices: new Set() }),
  setSpreadSize: (id) => set({ spreadSizeId: id }),
  setCustomSize: (size) => set({ customSize: size }),
  setBlendEdges: (val) => set(h(() => ({ blendEdges: val }))),
  // setBookName: writes the new name into the store AND renames the
  // current project in the Projects index. Project name = book name
  // (one source of truth — whichever surface the user edits, the other
  // reflects it).
  setBookName: (name) => {
    const clean = (name || '').trim() || 'photobook';
    set({ bookName: clean });
    // Best-effort rename — projects.js is async-imported to avoid a
    // circular dep at module init.
    import('./projects').then(({ getActiveProjectId, renameProject }) => {
      const id = getActiveProjectId();
      if (id) renameProject(id, clean);
    }).catch(() => { /* ignore */ });
  },
  setGap: (gap) => set(h(() => ({ gap }))),

  // ── Photo selection ────────────────────────────────────────────────
  togglePhotoSelection: (id) => set((s) => {
    const next = new Set(s.selectedPhotoIds);
    next.has(id) ? next.delete(id) : next.add(id);
    return { selectedPhotoIds: next };
  }),
  setPhotoSelection: (ids) => set({ selectedPhotoIds: ids instanceof Set ? ids : new Set(ids) }),
  selectAllPhotos: () => set((s) => ({ selectedPhotoIds: new Set(s.photos.map((p) => p.id)) })),
  clearPhotoSelection: () => set({ selectedPhotoIds: new Set() }),

  // ── Photos ─────────────────────────────────────────────────────────
  addPhotos: (newPhotos) => set((s) => {
    // If the cover is still untouched (default full-bleed template with no
    // photo assigned), pick a random Cover-category template as a starting
    // design when the user first imports photos.
    const cover = s.spreads[0];
    const isUntouched = cover?.templateId === 'full-bleed' && !cover?.cells?.[0]?.photoId;
    if (!isUntouched || newPhotos.length === 0) {
      return { photos: [...s.photos, ...newPhotos] };
    }
    const coverTemplates = TEMPLATES.filter((t) => t.category === 'Cover');
    if (coverTemplates.length === 0) {
      return { photos: [...s.photos, ...newPhotos] };
    }
    const tmpl = coverTemplates[Math.floor(Math.random() * coverTemplates.length)];
    const newCover = {
      ...cover,
      role: 'cover',
      templateId: tmpl.id,
      cellGeometry: tmpl.cells.map((c) => ({ ...c })),
      cells: tmpl.cells.map((c) => makeCell(c)),
      ...(tmpl.bgColor ? { bgColor: tmpl.bgColor, bgMode: 'color' } : {}),
      ...(tmpl.captions ? {
        captions: tmpl.captions.map((c) => ({ ...c, id: `cap${captionIdCounter++}` })),
      } : {}),
    };
    return {
      photos: [...s.photos, ...newPhotos],
      spreads: s.spreads.map((sp, i) => i === 0 ? newCover : sp),
    };
  }),

  removePhoto: (photoId) => set(h((s) => ({
    photos: s.photos.filter((p) => p.id !== photoId),
    selectedPhotoIds: (() => { const n = new Set(s.selectedPhotoIds); n.delete(photoId); return n; })(),
    spreads: s.spreads.map((sp) => ({
      ...sp,
      cells: sp.cells.map((c) => c.photoId === photoId ? { ...c, photoId: null } : c),
    })),
  }))),

  // ── Spreads ────────────────────────────────────────────────────────
  // Add a single new cell at a specific normalized geometry
  addCellAt: (spreadId, geo) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      const safeGeo = {
        x: round4(Math.max(0, Math.min(1 - geo.w, geo.x))),
        y: round4(Math.max(0, Math.min(1 - geo.h, geo.y))),
        w: round4(Math.min(1, geo.w)),
        h: round4(Math.min(1, geo.h)),
        hint: geo.hint ?? null,
      };
      return {
        ...sp,
        cellGeometry: [...sp.cellGeometry, safeGeo],
        cells: [...sp.cells, makeCell(safeGeo)],
      };
    }),
  }))),

  addSpread: () => set(h((s) => {
    const newId = Math.max(...s.spreads.map((sp) => sp.id)) + 1;
    return { spreads: [...s.spreads, makeSpread(newId)] };
  })),

  addMultipleSpreads: (count) => set(h((s) => {
    const maxId = Math.max(...s.spreads.map((sp) => sp.id));
    const newSpreads = Array.from({ length: count }, (_, i) => makeSpread(maxId + i + 1));
    return { spreads: [...s.spreads, ...newSpreads] };
  })),

  removeSpread: (id) => set(h((s) => {
    if (s.spreads.length <= 1) return s;
    const spreads = s.spreads.filter((sp) => sp.id !== id);
    const activeSpreadId = s.activeSpreadId === id ? spreads[0].id : s.activeSpreadId;
    return { spreads, activeSpreadId };
  })),

  duplicateSpread: (id) => set(h((s) => {
    const idx = s.spreads.findIndex((sp) => sp.id === id);
    if (idx === -1) return s;
    const newId = Math.max(...s.spreads.map((sp) => sp.id)) + 1;
    const copy = JSON.parse(JSON.stringify(s.spreads[idx]));
    copy.id = newId;
    copy.role = null; // duplicates don't inherit cover/back role
    // Clear photo assignments — a duplicate inherits the LAYOUT, not the photos
    copy.cells = copy.cells.map((c) => ({ ...c, photoId: null, zoom: 1, offsetX: 0, offsetY: 0 }));
    const newSpreads = [...s.spreads.slice(0, idx + 1), copy, ...s.spreads.slice(idx + 1)];
    return { spreads: newSpreads };
  })),

  reorderSpreads: (fromId, toId) => set(h((s) => {
    if (fromId === toId) return s;
    const fromIdx = s.spreads.findIndex((sp) => sp.id === fromId);
    const toIdx = s.spreads.findIndex((sp) => sp.id === toId);
    if (fromIdx === -1 || toIdx === -1) return s;
    const newSpreads = [...s.spreads];
    const [moved] = newSpreads.splice(fromIdx, 1);
    newSpreads.splice(toIdx, 0, moved);
    return { spreads: newSpreads };
  })),

  setSpreadRole: (spreadId, role) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : { ...sp, role }
    ),
  }))),

  setSpreadBgColor: (spreadId, color) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : { ...sp, bgColor: color, bgMode: 'color' }
    ),
  }))),

  setSpreadBgGradient: (spreadId, gradient) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : { ...sp, bgGradient: gradient, bgMode: 'gradient' }
    ),
  }))),

  setSpreadBgImage: (spreadId, src) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : { ...sp, bgImage: src, bgMode: 'image' }
    ),
  }))),

  setSpreadBgMode: (spreadId, mode) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : { ...sp, bgMode: mode }
    ),
  }))),

  setSpreadBgOverlay: (spreadId, overlay) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : { ...sp, bgOverlay: overlay }
    ),
  }))),

  setCellGradient: (spreadId, cellIndex, gradient) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      return {
        ...sp,
        cells: sp.cells.map((c, i) => i === cellIndex ? { ...c, gradient } : c),
      };
    }),
  }))),

  // Snap a spread's cellGeometry back to its template's original cells.
  // Use this to clear white gaps left by the legacy fitGeoToPhoto behaviour
  // on pre-existing spreads. Photo assignments are preserved.
  snapCellsToTemplate: (spreadId) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      const tmpl = TEMPLATES.find((t) => t.id === sp.templateId);
      if (!tmpl) return sp;
      return {
        ...sp,
        cellGeometry: tmpl.cells.map((c) => ({ ...c })),
        // Keep photos in their existing cell indices; reset crop so the
        // photo re-fits inside the full-size cell cleanly.
        cells: tmpl.cells.map((tc, i) => ({
          ...(sp.cells[i] || makeCell(tc)),
          hint: tc.hint ?? null,
          zoom: 1, offsetX: 0, offsetY: 0, manualCrop: false,
        })),
      };
    }),
  }))),

  // Same as above, applied to every spread. Useful as a one-click migration.
  snapAllCellsToTemplate: () => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      const tmpl = TEMPLATES.find((t) => t.id === sp.templateId);
      if (!tmpl) return sp;
      return {
        ...sp,
        cellGeometry: tmpl.cells.map((c) => ({ ...c })),
        cells: tmpl.cells.map((tc, i) => ({
          ...(sp.cells[i] || makeCell(tc)),
          hint: tc.hint ?? null,
          zoom: 1, offsetX: 0, offsetY: 0, manualCrop: false,
        })),
      };
    }),
  }))),

  setTemplate: (spreadId, templateId) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      const tmpl = TEMPLATES.find((t) => t.id === templateId);
      if (!tmpl) return sp;
      // Cover-category templates carry presets: bgColor + styled captions
      const hasPresets = tmpl.category === 'Cover';
      return {
        ...sp,
        templateId,
        cellGeometry: tmpl.cells.map((c) => ({ ...c })),
        cells: tmpl.cells.map((tc, i) => ({ ...(sp.cells[i] || makeCell(tc)), hint: tc.hint ?? null })),
        ...(hasPresets && tmpl.bgColor ? { bgColor: tmpl.bgColor, bgMode: 'color' } : {}),
        ...(hasPresets && tmpl.captions ? {
          captions: tmpl.captions.map((c) => ({ ...c, id: `cap${captionIdCounter++}` })),
        } : {}),
      };
    }),
    selectedCellIndex: null,
    selectedCellIndices: new Set(),
  }))),

  setCellGeometry: (spreadId, cellGeometry) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : {
        ...sp,
        cellGeometry: cellGeometry.map((c) => ({
          x: round4(c.x), y: round4(c.y), w: round4(c.w), h: round4(c.h),
        })),
      }
    ),
  }))),

  clearCell: (spreadId, cellIndex) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      return {
        ...sp,
        cells: sp.cells.map((c, i) =>
          i === cellIndex ? { ...makeCell(c), locked: c.locked, hint: c.hint } : c
        ),
      };
    }),
  }))),

  // assignPhoto(spreadId, cellIndex, photoId, { allowDuplicate })
  //   - allowDuplicate: false (default) → move semantics: photo is cleared
  //     from any other cell it occupies. Use when caller doesn't care about
  //     duplicates or has already confirmed.
  //   - allowDuplicate: true → keep the photo in its existing cell(s) AND
  //     place it in the new cell. Use after user confirms reuse via prompt.
  assignPhoto: (spreadId, cellIndex, photoId, opts = {}) => set(h((s) => {
    const { allowDuplicate = false } = opts;
    const { w: sw, h: sh } = getScreenDims(s.spreadSizeId, s.customSize);
    const base = allowDuplicate ? s.spreads : s.spreads.map((sp) => ({
      ...sp,
      cells: sp.cells.map((c, ci) =>
        c.photoId === photoId && !(sp.id === spreadId && ci === cellIndex)
          ? { ...c, photoId: null }
          : c
      ),
    }));
    return {
      spreads: base.map((sp) => {
        if (sp.id !== spreadId) return sp;
        const photo = s.photos.find((p) => p.id === photoId);
        const cell = sp.cells[cellIndex];
        const geo = sp.cellGeometry[cellIndex];
        // Only auto-fit the cell to the photo when the user hasn't manually
        // adjusted the cell. Once manualCrop=true, keep the user's shape.
        const newGeo = (photo && geo && !cell?.manualCrop)
          ? fitGeoToPhoto(geo, photo.width / photo.height, sw, sh)
          : geo;
        const offsetY = topAlignOffsetY(newGeo, photo, sw, sh);
        return {
          ...sp,
          cellGeometry: sp.cellGeometry.map((g, i) => i === cellIndex ? newGeo : g),
          cells: sp.cells.map((c, i) =>
            i === cellIndex ? { ...c, photoId, zoom: 1, offsetX: 0, offsetY, rotation: 0 } : c
          ),
        };
      }),
    };
  })),

  // Face prioritization: apply a Map<photoId, score 0..1> onto photos.
  // Photos not in the map get facePriority 0. Auto-design then orders
  // by facePriority DESC so the key person's photos land first + in
  // the hero cells. Passing null clears all priorities.
  setPhotoFacePriorities: (scoreMap) => set((s) => ({
    photos: s.photos.map((p) => ({
      ...p,
      facePriority: scoreMap ? (scoreMap.get(p.id) || 0) : 0,
    })),
  })),

  // Plain click: replace selection with this single cell (idx=null clears).
  setSelectedCell: (idx) => set({
    selectedCellIndex: idx,
    selectedCellIndices: idx == null ? new Set() : new Set([idx]),
  }),

  // Shift/Cmd click: add or remove idx from selection. The "primary" cell
  // (selectedCellIndex) only changes if idx is added (becomes new primary)
  // or if the primary itself is removed (next remaining cell takes over).
  toggleCellSelection: (idx) => set((s) => {
    if (idx == null) return s;
    const next = new Set(s.selectedCellIndices);
    let primary = s.selectedCellIndex;
    if (next.has(idx)) {
      next.delete(idx);
      if (primary === idx) primary = next.size > 0 ? [...next][0] : null;
    } else {
      next.add(idx);
      primary = idx;
    }
    return { selectedCellIndex: primary, selectedCellIndices: next };
  }),

  // Move every selected cell by the same normalized delta. Clamped so no
  // cell escapes the spread; if any would go out of bounds the whole
  // group's delta is reduced uniformly to keep relative offsets intact.
  multiMoveCells: (spreadId, indices, dx, dy) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      const set = new Set(indices);
      // Find the maximum delta that keeps every cell on-spread.
      let cdx = dx, cdy = dy;
      sp.cellGeometry.forEach((g, i) => {
        if (!set.has(i)) return;
        if (g.x + cdx < 0) cdx = -g.x;
        if (g.x + g.w + cdx > 1) cdx = 1 - g.x - g.w;
        if (g.y + cdy < 0) cdy = -g.y;
        if (g.y + g.h + cdy > 1) cdy = 1 - g.y - g.h;
      });
      return {
        ...sp,
        cellGeometry: sp.cellGeometry.map((g, i) => set.has(i)
          ? { ...g, x: round4(g.x + cdx), y: round4(g.y + cdy) }
          : g),
        cells: sp.cells.map((c, i) => set.has(i) ? { ...c, manualCrop: true } : c),
      };
    }),
  }))),

  // Scale every selected cell proportionally inside a new union bounding box.
  // before/after are normalized {x,y,w,h} of the union before and after the
  // user's drag. Each cell's geometry is reprojected from before-space into
  // after-space so relative position + proportion are preserved.
  multiResizeCells: (spreadId, indices, before, after) => set(h((s) => {
    const MIN = 0.04;
    const sx = before.w > 0 ? after.w / before.w : 1;
    const sy = before.h > 0 ? after.h / before.h : 1;
    const set = new Set(indices);
    return {
      spreads: s.spreads.map((sp) => {
        if (sp.id !== spreadId) return sp;
        return {
          ...sp,
          cellGeometry: sp.cellGeometry.map((g, i) => {
            if (!set.has(i)) return g;
            const relX = (g.x - before.x) * sx;
            const relY = (g.y - before.y) * sy;
            const w = Math.max(MIN, g.w * sx);
            const h = Math.max(MIN, g.h * sy);
            const x = Math.max(0, Math.min(1 - w, after.x + relX));
            const y = Math.max(0, Math.min(1 - h, after.y + relY));
            return { ...g, x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
          }),
          cells: sp.cells.map((c, i) => set.has(i) ? { ...c, manualCrop: true } : c),
        };
      }),
    };
  })),

  // Wipe autosave and reset to a blank project
  resetProject: () => {
    clearAutosave();
    photoIdCounter = 1;
    captionIdCounter = 1;
    set({
      spreads: [
        makeSpread(1, TEMPLATES[0]),
        makeSpread(2, TEMPLATES[2]),
        makeSpread(3, TEMPLATES[10]),
      ],
      activeSpreadId: 1,
      photos: [],
      selectedPhotoIds: new Set(),
      repeatedPhotoIds: new Set(),
      selectedCellIndex: null,
      selectedCellIndices: new Set(),
      bookName: 'photobook',
      past: [],
      future: [],
    });
  },

  // Clear duplicate photo assignments — keep first occurrence, blank the rest
  dedupePhotos: () => set(h((s) => {
    const seen = new Set();
    return {
      spreads: s.spreads.map((sp) => ({
        ...sp,
        cells: sp.cells.map((c) => {
          if (!c.photoId) return c;
          if (seen.has(c.photoId)) return { ...c, photoId: null };
          seen.add(c.photoId);
          return c;
        }),
      })),
      repeatedPhotoIds: new Set(),
    };
  })),

  // Resize a single cell's geometry and save to undo history.
  // Also flags the cell as manualCrop so future photo placements won't
  // reshape it back to fit the photo's aspect.
  commitResizeCell: (spreadId, cellIndex, geo) => set(h((s) => {
    const MIN = 0.04;
    return {
      spreads: s.spreads.map((sp) => {
        if (sp.id !== spreadId) return sp;
        return {
          ...sp,
          cellGeometry: sp.cellGeometry.map((g, i) => {
            if (i !== cellIndex) return g;
            const x = round4(Math.max(0, Math.min(1 - MIN, geo.x)));
            const y = round4(Math.max(0, Math.min(1 - MIN, geo.y)));
            return {
              x, y,
              w: round4(Math.max(MIN, Math.min(1 - x, geo.w))),
              h: round4(Math.max(MIN, Math.min(1 - y, geo.h))),
              hint: g.hint,
            };
          }),
          cells: sp.cells.map((c, i) => i === cellIndex ? { ...c, manualCrop: true } : c),
        };
      }),
    };
  })),

  // Not in history — called continuously during pan/zoom.
  // Also flags the cell as manualCrop so future photo placements keep
  // the user's chosen crop instead of re-fitting to the new photo.
  adjustCell: (spreadId, cellIndex, patch) => set((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      return { ...sp, cells: sp.cells.map((c, i) => i === cellIndex ? { ...c, ...patch, manualCrop: true } : c) };
    }),
  })),

  rotateCellPhoto: (spreadId, cellIndex) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      return {
        ...sp,
        cells: sp.cells.map((c, i) =>
          i === cellIndex ? { ...c, rotation: ((c.rotation || 0) + 90) % 360 } : c
        ),
      };
    }),
  }))),

  toggleCellLock: (spreadId, cellIndex) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      return {
        ...sp,
        cells: sp.cells.map((c, i) =>
          i === cellIndex ? { ...c, locked: !c.locked } : c
        ),
      };
    }),
  }))),

  // Clones a cell inside the same spread. The copy is offset slightly so
  // it's visible (not stacked exactly on top), and all photo/effect/crop
  // state is preserved. Cell is clamped to stay inside the spread.
  duplicateCell: (spreadId, cellIndex) => set(h((s) => {
    const spread = s.spreads.find((sp) => sp.id === spreadId);
    if (!spread) return s;
    const geo = spread.cellGeometry[cellIndex];
    const cell = spread.cells[cellIndex];
    if (!geo || !cell) return s;
    const OFFSET = 0.04;
    let nx = round4(Math.min(1 - geo.w, geo.x + OFFSET));
    let ny = round4(Math.min(1 - geo.h, geo.y + OFFSET));
    // If the offset would push the copy off-edge, place it at top-left
    if (nx >= 1 - geo.w) nx = 0;
    if (ny >= 1 - geo.h) ny = 0;
    const newGeo = { ...geo, x: nx, y: ny };
    const newCell = { ...cell, manualCrop: true }; // duplicate keeps user crop
    return {
      spreads: s.spreads.map((sp) => sp.id === spreadId ? {
        ...sp,
        cellGeometry: [...sp.cellGeometry, newGeo],
        cells: [...sp.cells, newCell],
      } : sp),
      selectedCellIndex: spread.cells.length, // select the new copy
      selectedCellIndices: new Set([spread.cells.length]),
    };
  })),

  // Clones a caption inside the same spread. Offset slightly + new id.
  duplicateCaption: (spreadId, captionId) => set(h((s) => {
    const spread = s.spreads.find((sp) => sp.id === spreadId);
    if (!spread) return s;
    const cap = spread.captions.find((c) => c.id === captionId);
    if (!cap) return s;
    const OFFSET = 0.03;
    const nx = round4(Math.min(1 - (cap.w || 0.3), (cap.x || 0) + OFFSET));
    const ny = round4(Math.min(1 - 0.05, (cap.y || 0) + OFFSET));
    const newCap = { ...cap, id: `cap${captionIdCounter++}`, x: nx, y: ny };
    return {
      spreads: s.spreads.map((sp) => sp.id === spreadId ? {
        ...sp,
        captions: [...sp.captions, newCap],
      } : sp),
    };
  })),

  splitCell: (spreadId, cellIndex, direction) => set(h((s) => {
    const spread = s.spreads.find((sp) => sp.id === spreadId);
    if (!spread) return s;
    const geo = spread.cellGeometry;
    const c = geo[cellIndex];
    if (!c) return s;
    let a, b;
    if (direction === 'v') {
      const hw = round4(c.w / 2);
      a = { ...c, w: hw };
      b = { ...c, x: round4(c.x + hw), w: hw };
    } else {
      const hh = round4(c.h / 2);
      a = { ...c, h: hh };
      b = { ...c, y: round4(c.y + hh), h: hh };
    }
    const newGeo = [...geo.slice(0, cellIndex), a, b, ...geo.slice(cellIndex + 1)];
    const newCells = [...spread.cells.slice(0, cellIndex + 1), makeCell(c), ...spread.cells.slice(cellIndex + 1)];
    return {
      spreads: s.spreads.map((sp) => sp.id === spreadId ? { ...sp, cellGeometry: newGeo, cells: newCells } : sp),
      selectedCellIndex: cellIndex,
      selectedCellIndices: new Set([cellIndex]),
    };
  })),

  removeCell: (spreadId, cellIndex) => set(h((s) => {
    const spread = s.spreads.find((sp) => sp.id === spreadId);
    if (!spread || spread.cellGeometry.length < 1) return s;
    const removedPhotoId = spread.cells[cellIndex]?.photoId ?? null;
    return {
      spreads: s.spreads.map((sp) =>
        sp.id !== spreadId ? sp : {
          ...sp,
          cellGeometry: sp.cellGeometry.filter((_, i) => i !== cellIndex),
          cells: sp.cells.filter((_, i) => i !== cellIndex),
        }
      ),
      photos: removedPhotoId != null ? s.photos.filter((p) => p.id !== removedPhotoId) : s.photos,
      selectedPhotoIds: removedPhotoId != null
        ? new Set([...s.selectedPhotoIds].filter((id) => id !== removedPhotoId))
        : s.selectedPhotoIds,
      selectedCellIndex: null,
      selectedCellIndices: new Set(),
    };
  })),

  // ── Transfer cell to last spread ──────────────────────────────────
  transferCell: (fromSpreadId, cellIndex) => set(h((s) => {
    const fromSpread = s.spreads.find((sp) => sp.id === fromSpreadId);
    if (!fromSpread) return s;
    const cellGeo = fromSpread.cellGeometry[cellIndex];
    const cellData = fromSpread.cells[cellIndex];
    if (!cellGeo || !cellData) return s;
    const lastSpread = s.spreads[s.spreads.length - 1];
    if (!lastSpread || lastSpread.id === fromSpreadId) return s;
    return {
      spreads: s.spreads.map((sp) => {
        if (sp.id === fromSpreadId) {
          return {
            ...sp,
            cellGeometry: sp.cellGeometry.filter((_, i) => i !== cellIndex),
            cells: sp.cells.filter((_, i) => i !== cellIndex),
          };
        }
        if (sp.id === lastSpread.id) {
          return {
            ...sp,
            cellGeometry: [...sp.cellGeometry, { ...cellGeo }],
            cells: [...sp.cells, { ...cellData }],
          };
        }
        return sp;
      }),
      selectedCellIndex: null,
      selectedCellIndices: new Set(),
    };
  })),

  setRepeatedPhotoIds: (ids) => set({ repeatedPhotoIds: ids }),

  // ── Photo management ──────────────────────────────────────────────
  setPhotoFilter: (f) => set({ photoFilter: f }),
  setPhotoSort: (s) => set({ photoSort: s }),
  setPhotoSearch: (q) => set({ photoSearch: q }),
  togglePhotoFavorite: (id) => set((s) => ({
    photos: s.photos.map((p) => p.id === id ? { ...p, favorite: !p.favorite } : p),
  })),

  // ── Cell effects ──────────────────────────────────────────────────
  setCellEffects: (spreadId, cellIndex, effects) => set(h((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      return { ...sp, cells: sp.cells.map((c, i) => i === cellIndex ? { ...c, effects } : c) };
    }),
  }))),

  // ── Captions ───────────────────────────────────────────────────────
  addCaption: (spreadId, cap) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : {
        ...sp,
        captions: [...sp.captions, { id: `cap${captionIdCounter++}`, ...cap }],
      }
    ),
  }))),

  updateCaption: (spreadId, capId, patch) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : {
        ...sp,
        captions: sp.captions.map((c) => c.id === capId ? { ...c, ...patch } : c),
      }
    ),
  }))),

  removeCaption: (spreadId, capId) => set(h((s) => ({
    spreads: s.spreads.map((sp) =>
      sp.id !== spreadId ? sp : {
        ...sp,
        captions: sp.captions.filter((c) => c.id !== capId),
      }
    ),
  }))),

  // ── Auto arrange single spread (fills empty, unlocked cells) ──────
  autoArrange: (spreadId) => set(h((s) => {
    const spread = s.spreads.find((sp) => sp.id === spreadId);
    if (!spread) return s;
    const { w: sw, h: sh } = getScreenDims(s.spreadSizeId, s.customSize);
    // Exclude photos already used in ANY spread so no photo appears twice
    const usedIds = new Set(s.spreads.flatMap((sp) => sp.cells.map((c) => c.photoId).filter(Boolean)));
    // Key-person photos first so they win the empty cells on this spread.
    let pool = facePrioritySort(s.photos.filter((p) => !usedIds.has(p.id)));
    const newCells = [...spread.cells];
    const newGeo = [...spread.cellGeometry];
    spread.cells.forEach((cell, i) => {
      if (cell.locked || cell.photoId || pool.length === 0) return;
      const geo = newGeo[i];
      if (!geo) return;
      const idx = pickBestPhoto(pool, (geo.w * sw) / (geo.h * sh));
      const photo = pool[idx];
      pool = pool.filter((_, pi) => pi !== idx);
      if (!cell.manualCrop) newGeo[i] = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh);
      newCells[i] = { ...cell, photoId: photo.id, zoom: 1, offsetX: 0, offsetY: topAlignOffsetY(newGeo[i], photo, sw, sh) };
    });
    return { spreads: s.spreads.map((sp) => sp.id === spreadId ? { ...sp, cells: newCells, cellGeometry: newGeo } : sp) };
  })),

  // ── Auto design all spreads ───────────────────────────────────────
  // Each spread is upgraded to a high-density template (≥18 cells) before
  // photos are distributed, ensuring every spread gets at least 18 images.
  autoDesignAll: () => set(h((s) => {
    const { w: sw, h: sh } = getScreenDims(s.spreadSizeId, s.customSize);
    const useSelected = s.selectedPhotoIds.size > 0;
    const sourcePhotos = useSelected ? s.photos.filter((p) => s.selectedPhotoIds.has(p.id)) : s.photos;

    // Photos already placed anywhere — protect them from being reshuffled
    const alreadyPlaced = new Set(
      s.spreads.flatMap((sp) => sp.cells.map((c) => c.photoId).filter(Boolean))
    );
    // Key-person photos first (facePriority), then natural filename order.
    let pool = facePrioritySort(sourcePhotos.filter((p) => !alreadyPlaced.has(p.id)));

    const portraitCount = pool.filter((p) => p.height > p.width).length;
    const portraitDominant = pool.length > 0 && portraitCount > pool.length / 2;

    // One gradient palette picked per Design All call — applied to every
    // newly-templated spread for a consistent book feel.
    const designGradient = pickAutoGradient();

    // Progressive density: spread 1 = 1–3 cells, spread 2 = 2–4 cells, …
    // (cover at index 0 is untouched). Spreads the user already designed
    // (have any photos placed) are left alone.
    let spreads = s.spreads.map((sp, idx) => {
      if (idx === 0) return sp; // cover protected
      const hasAnyPhoto = sp.cells.some((c) => c.photoId);
      if (!hasAnyPhoto) {
        const tmpl = pickProgressiveTemplate(idx, portraitDominant, sw, sh);
        return {
          ...sp,
          templateId: tmpl.id,
          cellGeometry: tmpl.cells.map((c) => ({ ...c })),
          cells: tmpl.cells.map((c) => makeCell(c)),
          bgMode: 'gradient',
          bgGradient: { ...designGradient },
        };
      }
      return sp;
    });

    // Add more spreads until all unplaced photos have a cell. New spreads
    // keep the progressive density curve so we don't suddenly jump to dense.
    const availableCells = () => spreads.reduce((acc, sp) =>
      acc + sp.cells.filter((c) => !c.locked && !c.photoId).length, 0);
    let maxId = Math.max(...spreads.map((sp) => sp.id));
    while (pool.length > availableCells()) {
      const newIdx = spreads.length;
      const tmpl = pickProgressiveTemplate(newIdx, portraitDominant, sw, sh);
      const fresh = makeSpread(++maxId, tmpl);
      spreads.push({ ...fresh, bgMode: 'gradient', bgGradient: { ...designGradient } });
    }

    // Fill ONLY empty, non-locked cells — never overwrite existing placements.
    // Skip the cover spread entirely.
    //
    // Photos are taken from the (priority-sorted) pool with pool.shift(),
    // so the key person's photos come first. When prioritized photos
    // exist we also fill the BIGGEST cells first on each spread, so the
    // key person gets hero-sized placement instead of whatever cell
    // happened to come first in template order. With no prioritized
    // photos we keep the original template (reading) order.
    const poolHasPriority = pool.some((p) => (p.facePriority || 0) > 0);
    const newSpreads = spreads.map((spread, idx) => {
      if (idx === 0) return spread;
      const newCells = [...spread.cells];
      const newGeo = [...spread.cellGeometry];

      // Indices of fillable cells on this spread, in the order we'll fill.
      let order = spread.cells
        .map((cell, i) => i)
        .filter((i) => !newCells[i].locked && !newCells[i].photoId && newGeo[i]);
      if (poolHasPriority) {
        order = order.sort((a, b) => {
          const ga = newGeo[a], gb = newGeo[b];
          return (gb.w * gb.h) - (ga.w * ga.h); // biggest cell first
        });
      }

      for (const i of order) {
        if (pool.length === 0) break;
        const cell = newCells[i];
        let geo = newGeo[i];
        const photo = pool.shift();
        if (!cell.manualCrop) { geo = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh); newGeo[i] = geo; }
        newCells[i] = { ...cell, photoId: photo.id, zoom: 1, offsetX: 0, offsetY: topAlignOffsetY(geo, photo, sw, sh) };
      }
      return { ...spread, cells: newCells, cellGeometry: newGeo };
    });

    // Tight pack: zero gap between cells when auto-designing
    return { spreads: newSpreads, selectedPhotoIds: new Set(), gap: 0 };
  })),

  // ── Redesign a single spread with a new high-density template ────
  redesignSpread: (spreadId) => set(h((s) => {
    const { w: sw, h: sh } = getScreenDims(s.spreadSizeId, s.customSize);
    const spread = s.spreads.find((sp) => sp.id === spreadId);
    if (!spread) return s;

    const portraitCount = s.photos.filter((p) => p.height > p.width).length;
    const portraitDominant = portraitCount > s.photos.length / 2;
    // Editorial wedding-style picker (3–9 cells) rather than the dense one,
    // so single-spread Redesign produces clean hero+supporting layouts.
    const tmpl = pickEditorialTemplate(portraitDominant, sw, sh);

    // Only use photos not placed anywhere in the book
    const usedEverywhere = new Set(
      s.spreads.flatMap((sp) => sp.cells.map((c) => c.photoId).filter(Boolean))
    );

    // Key-person photos first; then natural sort order within each bucket.
    let pool = facePrioritySort(s.photos.filter((p) => !usedEverywhere.has(p.id)));

    const newGeo = tmpl.cells.map((c) => ({ ...c }));
    const newCells = tmpl.cells.map((c) => makeCell(c));

    // Fill biggest cells first when prioritized photos exist so the key
    // person lands in the hero cell of the new layout.
    const poolHasPriority = pool.some((p) => (p.facePriority || 0) > 0);
    let order = newCells.map((_, i) => i);
    if (poolHasPriority) {
      order = order.sort((a, b) => (newGeo[b].w * newGeo[b].h) - (newGeo[a].w * newGeo[a].h));
    }
    for (const i of order) {
      if (pool.length === 0) break;
      const cell = newCells[i];
      const photo = pool.shift();
      const geo = fitGeoToPhoto(newGeo[i], photo.width / photo.height, sw, sh);
      newGeo[i] = geo;
      newCells[i] = { ...cell, photoId: photo.id, zoom: 1, offsetX: 0, offsetY: topAlignOffsetY(geo, photo, sw, sh) };
    }

    return {
      spreads: s.spreads.map((sp) =>
        sp.id !== spreadId ? sp : {
          ...sp,
          templateId: tmpl.id,
          cellGeometry: newGeo,
          cells: newCells,
        }
      ),
      selectedCellIndex: null,
      selectedCellIndices: new Set(),
    };
  })),

  // ── Reshuffle all spreads with random ordering ────────────────────
  // Reshuffle ONLY the current spread.
  //
  // Logic:
  //   1. If there are empty non-locked cells AND there are unplaced photos
  //      in the library → fill the empty cells with the next unplaced
  //      photos in arrangement order (sequential, deterministic).
  //   2. Otherwise (no empty cells, or all photos already placed elsewhere)
  //      → shuffle the photos already on this spread into different cells.
  //
  // Locked cells are never touched. Other spreads are never touched.
  reshuffleSpread: (spreadId) => set(h((s) => {
    const spread = s.spreads.find((sp) => sp.id === spreadId);
    if (!spread) return s;
    const { w: sw, h: sh } = getScreenDims(s.spreadSizeId, s.customSize);

    const editable = spread.cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => !cell.locked);
    const emptyOnes = editable.filter(({ cell }) => !cell.photoId);

    const newCells = [...spread.cells];
    const newGeo = [...spread.cellGeometry];

    // Path 1: empty cells + a pool of unplaced photos → sequential fill.
    if (emptyOnes.length > 0) {
      const usedIds = new Set(s.spreads.flatMap((sp) => sp.cells.map((c) => c.photoId).filter(Boolean)));
      const pool = s.photos.filter((p) => !usedIds.has(p.id));
      if (pool.length > 0) {
        let cursor = 0;
        for (const { i } of emptyOnes) {
          if (cursor >= pool.length) break;
          const photo = pool[cursor++];
          const geo = newGeo[i];
          if (!geo) continue;
          if (!newCells[i].manualCrop) newGeo[i] = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh);
          newCells[i] = { ...newCells[i], photoId: photo.id, zoom: 1, offsetX: 0, offsetY: topAlignOffsetY(newGeo[i], photo, sw, sh) };
        }
        return { spreads: s.spreads.map((sp) => sp.id === spreadId ? { ...sp, cells: newCells, cellGeometry: newGeo } : sp) };
      }
    }

    // Path 2: shuffle existing photos within this spread. Re-randomize
    // until the order actually differs (or we've tried enough times) so
    // the user sees something visibly change.
    const filledList = editable.filter(({ cell }) => cell.photoId);
    if (filledList.length < 2) return s; // nothing meaningful to shuffle
    const originalIds = filledList.map(({ cell }) => cell.photoId);
    let shuffled = shuffle(originalIds);
    for (let attempt = 0; attempt < 6 && shuffled.every((id, k) => id === originalIds[k]); attempt++) {
      shuffled = shuffle(originalIds);
    }
    filledList.forEach(({ i }, k) => {
      const photoId = shuffled[k];
      const photo = s.photos.find((p) => p.id === photoId);
      if (!photo) return;
      const geo = newGeo[i];
      if (!geo) return;
      if (!newCells[i].manualCrop) newGeo[i] = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh);
      newCells[i] = { ...newCells[i], photoId, zoom: 1, offsetX: 0, offsetY: topAlignOffsetY(newGeo[i], photo, sw, sh) };
    });
    return { spreads: s.spreads.map((sp) => sp.id === spreadId ? { ...sp, cells: newCells, cellGeometry: newGeo } : sp) };
  })),

  // ── Save / Load project ────────────────────────────────────────────
  saveProject: () => {
    const s = get();
    const data = JSON.stringify({
      version: 2,
      bookName: s.bookName,
      spreadSizeId: s.spreadSizeId,
      customSize: s.customSize,
      gap: s.gap,
      blendEdges: s.blendEdges,
      spreads: s.spreads,
      photos: s.photos,
    });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${s.bookName.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'photobook'}.photobook`;
    a.click();
    URL.revokeObjectURL(url);
  },

  loadProject: (json) => {
    try {
      const data = JSON.parse(json);
      const maxPhotoId = (data.photos || []).reduce(
        (max, p) => Math.max(max, parseInt(p.id) || 0), 0
      );
      photoIdCounter = maxPhotoId + 1;

      const allCaptions = (data.spreads || []).flatMap((sp) => sp.captions || []);
      const maxCapId = allCaptions.reduce(
        (max, c) => Math.max(max, parseInt((c.id || '').replace('cap', '')) || 0), 0
      );
      captionIdCounter = maxCapId + 1;

      // Normalize: ensure no photo appears in more than one cell.
      // Keep the FIRST occurrence (by spread order, then cell index), clear the rest.
      const seen = new Set();
      const normalizedSpreads = (data.spreads || []).map((sp) => ({
        ...sp,
        cells: (sp.cells || []).map((c) => {
          if (!c?.photoId) return c;
          if (seen.has(c.photoId)) return { ...c, photoId: null };
          seen.add(c.photoId);
          return c;
        }),
      }));

      set({
        bookName: data.bookName || 'photobook',
        spreadSizeId: data.spreadSizeId || 'sq-10',
        customSize: data.customSize || { w: 1920, h: 1080 },
        gap: data.gap ?? 3,
        blendEdges: data.blendEdges ?? false,
        spreads: normalizedSpreads,
        photos: data.photos || [],
        past: [],
        future: [],
        activeSpreadId: normalizedSpreads[0]?.id ?? 1,
        selectedCellIndex: null,
        selectedCellIndices: new Set(),
        selectedPhotoIds: new Set(),
      });
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  },
}));
