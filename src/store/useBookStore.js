import { create } from 'zustand';
import { TEMPLATES } from '../layouts/templates';
import { getScreenDims } from '../layouts/spreadSizes';
import { loadAutosave, clearAutosave } from './autosave';

const round4 = (n) => Math.round(n * 10000) / 10000;

const naturalSort = (arr) =>
  [...arr].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

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
// fitting within the original bounding box and centring the result.
// Returns the original geo unchanged if the photo already matches within 80 %.
const fitGeoToPhoto = (geo, photoAR, sw, sh) => {
  if (!photoAR || !isFinite(photoAR) || photoAR <= 0 || !sw || !sh) return geo;
  const cellAR = (geo.w * sw) / (geo.h * sh);
  if (!isFinite(cellAR) || cellAR <= 0) return geo;
  const ratio = photoAR / cellAR;
  if (ratio >= 0.8 && ratio <= 1.25) return geo; // already a good fit

  // Fit photo AR inside the cell's pixel bounding box, then convert back
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

// Pick a template whose cell count grows with the spread index.
// Spread 1 starts sparse (1–3 cells), each later spread allows ~2 more.
// Skips covers / wedding / event / print-only / cover templates so we pull
// from generic layouts only.
const pickProgressiveTemplate = (spreadIdx, portraitDominant, sw, sh) => {
  const target = Math.max(1, Math.min(18, spreadIdx));      // 1, 2, 3, … capped at 18
  const minCells = Math.max(1, target - 1);
  const maxCells = target + 2;
  const pool = TEMPLATES.filter((t) =>
    !t.printSize && !t.category &&
    t.cells.length >= minCells && t.cells.length <= maxCells
  );
  if (pool.length === 0) return pickHighDensityTemplate(portraitDominant, sw, sh);
  const scored = pool.map((t) => ({ t, ratio: portraitCellRatio(t, sw, sh) }));
  const suited = portraitDominant
    ? scored.filter(({ ratio }) => ratio >= 0.4)
    : scored.filter(({ ratio }) => ratio <= 0.4);
  const candidates = suited.length > 0 ? suited : scored;
  return candidates[Math.floor(Math.random() * candidates.length)].t;
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
  selectedCellIndex: null,
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
    };
  }),

  // ── ID helpers ─────────────────────────────────────────────────────
  nextPhotoId: () => String(photoIdCounter++),

  // ── Settings ───────────────────────────────────────────────────────
  setActiveSpread: (id) => set({ activeSpreadId: id, selectedCellIndex: null }),
  setSpreadSize: (id) => set({ spreadSizeId: id }),
  setCustomSize: (size) => set({ customSize: size }),
  setBlendEdges: (val) => set(h(() => ({ blendEdges: val }))),
  setBookName: (name) => set({ bookName: name }),
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
  addPhotos: (newPhotos) => set((s) => ({ photos: [...s.photos, ...newPhotos] })),

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
        const geo = sp.cellGeometry[cellIndex];
        const newGeo = (photo && geo)
          ? fitGeoToPhoto(geo, photo.width / photo.height, sw, sh)
          : geo;
        return {
          ...sp,
          cellGeometry: sp.cellGeometry.map((g, i) => i === cellIndex ? newGeo : g),
          cells: sp.cells.map((c, i) =>
            i === cellIndex ? { ...c, photoId, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 } : c
          ),
        };
      }),
    };
  })),

  setSelectedCell: (idx) => set({ selectedCellIndex: idx }),

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

  // Resize a single cell's geometry and save to undo history
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
        };
      }),
    };
  })),

  // Not in history — called continuously during pan/zoom
  adjustCell: (spreadId, cellIndex, patch) => set((s) => ({
    spreads: s.spreads.map((sp) => {
      if (sp.id !== spreadId) return sp;
      return { ...sp, cells: sp.cells.map((c, i) => i === cellIndex ? { ...c, ...patch } : c) };
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
    let pool = s.photos.filter((p) => !usedIds.has(p.id));
    const newCells = [...spread.cells];
    const newGeo = [...spread.cellGeometry];
    spread.cells.forEach((cell, i) => {
      if (cell.locked || cell.photoId || pool.length === 0) return;
      const geo = newGeo[i];
      if (!geo) return;
      const idx = pickBestPhoto(pool, (geo.w * sw) / (geo.h * sh));
      const photo = pool[idx];
      pool = pool.filter((_, pi) => pi !== idx);
      newGeo[i] = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh);
      newCells[i] = { ...cell, photoId: photo.id, zoom: 1, offsetX: 0, offsetY: 0 };
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
    let pool = naturalSort(sourcePhotos.filter((p) => !alreadyPlaced.has(p.id)));

    const portraitCount = pool.filter((p) => p.height > p.width).length;
    const portraitDominant = pool.length > 0 && portraitCount > pool.length / 2;

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
      spreads.push(makeSpread(++maxId, tmpl));
    }

    // Fill ONLY empty, non-locked cells — never overwrite existing placements.
    // Skip the cover spread entirely.
    const newSpreads = spreads.map((spread, idx) => {
      if (idx === 0) return spread;
      const newCells = [...spread.cells];
      const newGeo = [...spread.cellGeometry];
      spread.cells.forEach((cell, i) => {
        if (cell.locked || cell.photoId) return;
        const geo = newGeo[i];
        if (!geo || pool.length === 0) return;
        const cellAspect = (geo.w * sw) / (geo.h * sh);
        const idx = pickBestPhoto(pool, cellAspect);
        const photo = pool[idx];
        pool = pool.filter((_, pi) => pi !== idx);
        newGeo[i] = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh);
        newCells[i] = { ...cell, photoId: photo.id, zoom: 1, offsetX: 0, offsetY: 0 };
      });
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
    const tmpl = pickHighDensityTemplate(portraitDominant, sw, sh);

    // Only use photos not placed anywhere in the book
    const usedEverywhere = new Set(
      s.spreads.flatMap((sp) => sp.cells.map((c) => c.photoId).filter(Boolean))
    );

    let pool = shuffle(s.photos.filter((p) => !usedEverywhere.has(p.id)));

    const newGeo = tmpl.cells.map((c) => ({ ...c }));
    const newCells = tmpl.cells.map((c) => makeCell(c));

    newCells.forEach((cell, i) => {
      if (pool.length === 0) return;
      const geo = newGeo[i];
      const cellAspect = (geo.w * sw) / (geo.h * sh);
      const idx = pickBestPhoto(pool, cellAspect);
      const photo = pool[idx];
      pool = pool.filter((_, pi) => pi !== idx);
      newGeo[i] = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh);
      newCells[i] = { ...cell, photoId: photo.id, zoom: 1, offsetX: 0, offsetY: 0 };
    });

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
    };
  })),

  // ── Reshuffle all spreads with random ordering ────────────────────
  reshuffleAll: () => set(h((s) => {
    const { w: sw, h: sh } = getScreenDims(s.spreadSizeId, s.customSize);
    const useSelected = s.selectedPhotoIds.size > 0;
    let pool = shuffle(
      useSelected ? s.photos.filter((p) => s.selectedPhotoIds.has(p.id)) : s.photos
    );

    const poolIds = new Set(pool.map((p) => p.id));
    const newSpreads = s.spreads.map((spread, idx) => {
      if (idx === 0) return spread; // cover spread is protected from reshuffle
      // First pass: clear pool-photo assignments for non-locked cells
      const cleared = spread.cells.map((cell) =>
        (!cell.locked && cell.photoId && poolIds.has(cell.photoId))
          ? { ...cell, photoId: null }
          : cell
      );
      // Second pass: fill non-locked empty cells, reshaping geometry to fit each photo
      const newCells = [...cleared];
      const newGeo = [...spread.cellGeometry];
      cleared.forEach((cell, i) => {
        if (cell.locked || cell.photoId || pool.length === 0) return;
        const geo = newGeo[i];
        if (!geo) return;
        const cellAspect = (geo.w * sw) / (geo.h * sh);
        const idx = pickBestPhoto(pool, cellAspect);
        const photo = pool[idx];
        pool = pool.filter((_, pi) => pi !== idx);
        newGeo[i] = fitGeoToPhoto(geo, photo.width / photo.height, sw, sh);
        newCells[i] = { ...cell, photoId: photo.id, zoom: 1, offsetX: 0, offsetY: 0 };
      });
      return { ...spread, cells: newCells, cellGeometry: newGeo };
    });

    return { spreads: newSpreads };
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
        selectedPhotoIds: new Set(),
      });
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  },
}));
