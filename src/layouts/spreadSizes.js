// All dimensions are SPREADS (two pages side by side) at 300 DPI for print
// Page size shown in label; spread export is 2× page width
// w_in = page width × 2, h_in = page height
const inToPx = (inches) => Math.round(inches * 300);

export const SPREAD_SIZES = [
  // ── Square ────────────────────────────────────────────────────────
  { id: 'sq-6',   label: 'Square 6×6"  (Mini album)',          exportW: inToPx(12),  exportH: inToPx(6),   group: 'Square' },
  { id: 'sq-8',   label: 'Square 8×8"  (Everyday)',            exportW: inToPx(16),  exportH: inToPx(8),   group: 'Square' },
  { id: 'sq-10',  label: 'Square 10×10"  (Wedding)',           exportW: inToPx(20),  exportH: inToPx(10),  group: 'Square' },
  { id: 'sq-12',  label: 'Square 12×12"  (Portfolio)',         exportW: inToPx(24),  exportH: inToPx(12),  group: 'Square' },

  // ── Landscape ─────────────────────────────────────────────────────
  { id: 'ls-7x5',     label: 'Landscape 7×5"  (Weekend trip)',     exportW: inToPx(14),  exportH: inToPx(5),   group: 'Landscape' },
  { id: 'ls-8x6',     label: 'Landscape 8×6"  (Storybook)',        exportW: inToPx(16),  exportH: inToPx(6),   group: 'Landscape' },
  { id: 'ls-11x85',   label: 'Landscape 11×8.5"  (Travel / Yearbook)', exportW: inToPx(22),  exportH: inToPx(8.5), group: 'Landscape' },
  { id: 'ls-14x11',   label: 'Landscape 14×11"  (Fine-art)',       exportW: inToPx(28),  exportH: inToPx(11),  group: 'Landscape' },
  { id: 'ls-15x12',   label: 'Landscape 15×12"  (Studio book)',    exportW: inToPx(30),  exportH: inToPx(12),  group: 'Landscape' },
  { id: 'ls-16x12',   label: 'Landscape 16×12"  (Coffee table)',   exportW: inToPx(32),  exportH: inToPx(12),  group: 'Landscape' },
  { id: 'ls-30x12',   label: 'Landscape 30×12"  (Wide editorial)', exportW: inToPx(60),  exportH: inToPx(12),  group: 'Landscape' },

  // ── Portrait ──────────────────────────────────────────────────────
  { id: 'pt-5x7',   label: 'Portrait 5×7"  (Memory book)',       exportW: inToPx(10),  exportH: inToPx(7),   group: 'Portrait' },
  { id: 'pt-6x8',   label: 'Portrait 6×8"  (Vertical snaps)',    exportW: inToPx(12),  exportH: inToPx(8),   group: 'Portrait' },
  { id: 'pt-8x10',  label: 'Portrait 8×10"  (Formal portraits)', exportW: inToPx(16),  exportH: inToPx(10),  group: 'Portrait' },
  { id: 'pt-85x11', label: 'Portrait 8.5×11"  (Family history)', exportW: inToPx(17),  exportH: inToPx(11),  group: 'Portrait' },
  { id: 'pt-11x14', label: 'Portrait 11×14"  (Luxury / Fashion)', exportW: inToPx(22),  exportH: inToPx(14),  group: 'Portrait' },

  // ── Panoramic / Custom ───────────────────────────────────────────
  { id: 'pano-30x12',  label: 'Panoramic 30×12"  (landscape strip)', exportW: inToPx(60),  exportH: inToPx(12),  group: 'Panoramic' },
  { id: 'pano-12x30',  label: 'Panoramic 12×30"  (portrait tower)',  exportW: inToPx(24),  exportH: inToPx(30),  group: 'Panoramic' },
  { id: 'custom',      label: 'Custom…',                              exportW: null,        exportH: null,        group: 'Custom' },
];

const MAX_W = 1050;
const MAX_H = 640;

export function getEffectiveExportSize(sizeId, customSize) {
  if (sizeId === 'custom') return { exportW: customSize.w, exportH: customSize.h };
  const s = SPREAD_SIZES.find((s) => s.id === sizeId) || SPREAD_SIZES[0];
  return { exportW: s.exportW, exportH: s.exportH };
}

export function getScreenDims(sizeId, customSize) {
  const { exportW, exportH } = getEffectiveExportSize(sizeId, customSize || { w: 1920, h: 1080 });
  const ratio = exportW / exportH;
  let w = MAX_W, h = w / ratio;
  if (h > MAX_H) { h = MAX_H; w = h * ratio; }
  return { w: Math.round(w), h: Math.round(h) };
}

export function getExportPixelRatio(sizeId, screenW, customSize) {
  const { exportW } = getEffectiveExportSize(sizeId, customSize || { w: 1920, h: 1080 });
  return exportW / screenW;
}
