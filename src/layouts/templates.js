// All cells in normalized coords (0–1) relative to spread width/height.
// Dimensions are calibrated for the default 12×6 (2:1) spread so that
// cells closely match standard photo aspect ratios:
//   9:16 portrait  → cw/ch ≈ 0.281  (cw = ch × 9/32)
//   4:5  portrait  → cw/ch = 0.4    (cw = ch × 2/5)
//   16:9 landscape → cw/ch ≈ 0.889  (cw = ch × 8/9)
//
// Each cell may carry a `hint` tag so the auto-arrange engine can
// preferentially match photos of the same aspect family.

// ── Helper constants ─────────────────────────────────────────────────
//  9:16 full-height column : w = 0.281
//  4:5  full-height column : w = 0.400
//  16:9 at h=0.5           : w = 0.444
//  16:9 at h=0.5625        : w = 0.500  (two across, vertically centred)

export const TEMPLATES = [

  // ══ SINGLE ══════════════════════════════════════════════════════════

  { id: 'full-bleed', name: 'Full Bleed', cells: [
    { x:0, y:0, w:1, h:1, hint:'169' },
  ]},

  // Centred 16:9 hero — 89 % of spread width, full height
  { id: 'hero-land-169', name: 'Hero 16:9', cells: [
    { x:0.056, y:0, w:0.889, h:1, hint:'169' },
  ]},

  // Centred 4:5 portrait
  { id: 'hero-port-45', name: 'Hero 4:5', cells: [
    { x:0.3, y:0, w:0.4, h:1, hint:'45' },
  ]},

  // Centred 9:16 portrait
  { id: 'hero-port-916', name: 'Hero 9:16', cells: [
    { x:0.36, y:0, w:0.281, h:1, hint:'916' },
  ]},


  // ══ TWO ══════════════════════════════════════════════════════════════

  // Two 16:9 landscapes side by side, vertically centred
  { id: 'two-land-169', name: 'Two Landscape 16:9', cells: [
    { x:0,   y:0.219, w:0.5,   h:0.5625, hint:'169' },
    { x:0.5, y:0.219, w:0.5,   h:0.5625, hint:'169' },
  ]},

  // Two 4:5 portraits, equally spaced
  { id: 'two-port-45', name: 'Two Portrait 4:5', cells: [
    { x:0.067, y:0, w:0.4, h:1, hint:'45' },
    { x:0.533, y:0, w:0.4, h:1, hint:'45' },
  ]},

  // Two 9:16 portraits, equally spaced
  { id: 'two-port-916', name: 'Two Portrait 9:16', cells: [
    { x:0.146, y:0, w:0.281, h:1, hint:'916' },
    { x:0.573, y:0, w:0.281, h:1, hint:'916' },
  ]},

  // Landscape hero left + 4:5 portrait right
  { id: 'land-port-45', name: 'Landscape + Portrait', cells: [
    { x:0,   y:0, w:0.6, h:1, hint:'169' },
    { x:0.6, y:0, w:0.4, h:1, hint:'45'  },
  ]},

  // 9:16 portrait left + landscape right
  { id: 'port-916-land', name: 'Portrait 9:16 + Land', cells: [
    { x:0,     y:0, w:0.281, h:1, hint:'916' },
    { x:0.281, y:0, w:0.719, h:1, hint:'169' },
  ]},


  // ══ THREE ════════════════════════════════════════════════════════════

  // Three 9:16 portraits, equally distributed
  { id: 'three-port-916', name: 'Three Portrait 9:16', cells: [
    { x:0.039, y:0, w:0.281, h:1, hint:'916' },
    { x:0.359, y:0, w:0.281, h:1, hint:'916' },
    { x:0.679, y:0, w:0.281, h:1, hint:'916' },
  ]},

  // Three 4:5 portraits at 70 % height, vertically centred
  // (0.28 / 0.70) × 2 = 0.8 = 4:5 ✓
  { id: 'three-port-45', name: 'Three Portrait 4:5', cells: [
    { x:0.04, y:0.15, w:0.28, h:0.7, hint:'45' },
    { x:0.36, y:0.15, w:0.28, h:0.7, hint:'45' },
    { x:0.68, y:0.15, w:0.28, h:0.7, hint:'45' },
  ]},

  // Landscape hero left (60 %) + two 4:5 portraits stacked right (20 % × 50 %)
  // Right cells: (0.20 / 0.50) × 2 = 0.80 = 4:5 ✓
  { id: 'hero-two-port', name: 'Hero + 2 Portrait', cells: [
    { x:0,   y:0,   w:0.6,  h:1,   hint:'169' },
    { x:0.6, y:0,   w:0.2,  h:0.5, hint:'45'  },
    { x:0.8, y:0,   w:0.2,  h:0.5, hint:'45'  },
  ]},

  // Wide top landscape band + two 4:5 portraits below
  // Bottom cells: (0.40 / 0.50) × 2 = 1.6  → landscape-leaning; use 9:16 hint for portrait below
  { id: 'band-two-port', name: 'Band + 2 Portrait', cells: [
    { x:0,   y:0,    w:1,    h:0.438, hint:'169' },
    { x:0.1, y:0.438,w:0.35, h:0.562, hint:'45'  },
    { x:0.55,y:0.438,w:0.35, h:0.562, hint:'45'  },
  ]},

  // Two 4:5 portraits top + landscape bottom band
  { id: 'two-port-band', name: '2 Portrait + Band', cells: [
    { x:0.1, y:0,    w:0.35, h:0.562, hint:'45'  },
    { x:0.55,y:0,    w:0.35, h:0.562, hint:'45'  },
    { x:0,   y:0.562,w:1,    h:0.438, hint:'169' },
  ]},


  // ══ FOUR ═════════════════════════════════════════════════════════════

  // Four 9:16 portraits at 85 % height, centred
  // (0.239 / 0.850) × 2 = 0.562 ≈ 9:16 ✓
  { id: 'four-port-916', name: 'Four Portrait 9:16', cells: [
    { x:0.009, y:0.075, w:0.239, h:0.85, hint:'916' },
    { x:0.257, y:0.075, w:0.239, h:0.85, hint:'916' },
    { x:0.505, y:0.075, w:0.239, h:0.85, hint:'916' },
    { x:0.753, y:0.075, w:0.239, h:0.85, hint:'916' },
  ]},

  // Four 4:5 portraits at 62.5 % height, centred
  // (0.25 / 0.625) × 2 = 0.80 = 4:5 ✓
  { id: 'four-port-45', name: 'Four Portrait 4:5', cells: [
    { x:0,    y:0.188, w:0.25, h:0.625, hint:'45' },
    { x:0.25, y:0.188, w:0.25, h:0.625, hint:'45' },
    { x:0.5,  y:0.188, w:0.25, h:0.625, hint:'45' },
    { x:0.75, y:0.188, w:0.25, h:0.625, hint:'45' },
  ]},

  // Two 16:9 landscapes top + two 4:5 portraits bottom
  // Top: (0.5 / 0.438) × 2 = 2.28 — wide landscape ✓
  // Bottom: (0.3 / 0.562) × 2 = 1.07 — close to 1:1; adjusted below for 4:5
  // Bottom 4:5: h=0.5625, w=0.5*(4/5)/(spread) hmm
  // Let's use: top two 16:9 (h=0.438) + bottom two 4:5 (h=0.562, w=0.5*(0.562*0.4)=0.225 each)
  // Actually bottom: w=0.225, h=0.562 → (0.225/0.562)*2=0.8=4:5 ✓
  { id: 'two-land-two-port', name: '2 Land + 2 Portrait', cells: [
    { x:0,     y:0,     w:0.5,   h:0.438, hint:'169' },
    { x:0.5,   y:0,     w:0.5,   h:0.438, hint:'169' },
    { x:0.275, y:0.438, w:0.225, h:0.562, hint:'45'  },
    { x:0.5,   y:0.438, w:0.225, h:0.562, hint:'45'  },
  ]},

  // Landscape hero left + three 9:16 portrait columns right
  // Right 3 columns at 80 % height: (0.239 / 0.85) × 2 ≈ 9:16 ✓ — but only 3×0.239=0.717 wide
  // Hero takes 0.283; w×2 = 0.566, close to 9:16 — actually a wide portrait
  // Better: hero takes left 0.4, three 9:16 take right 0.6
  // Each: w = 0.6/3 = 0.2, h=1.0 → (0.2/1)*2=0.4 ≈ below 9:16 but portrait
  // Let's scale portrait height to fit 9:16: at w=0.2, h for 9:16 = 0.2/0.281 = 0.712
  { id: 'hero-three-port', name: 'Hero + 3 Portrait', cells: [
    { x:0,    y:0,     w:0.4,  h:1,     hint:'169' },
    { x:0.4,  y:0.144, w:0.2,  h:0.712, hint:'916' },
    { x:0.6,  y:0.144, w:0.2,  h:0.712, hint:'916' },
    { x:0.8,  y:0.144, w:0.2,  h:0.712, hint:'916' },
  ]},

  // Cross-split 4 — unequal quadrants (editorial)
  { id: 'cross-split-4', name: 'Cross Split 4', cells: [
    { x:0,    y:0,   w:0.55, h:0.5,  hint:'169' },
    { x:0.55, y:0,   w:0.45, h:0.5,  hint:'169' },
    { x:0,    y:0.5, w:0.35, h:0.5,  hint:'45'  },
    { x:0.35, y:0.5, w:0.65, h:0.5,  hint:'169' },
  ]},


  // ══ FIVE ══════════════════════════════════════════════════════════════

  // Five 9:16 portraits at 65 % height
  // (0.183 / 0.65) × 2 = 0.563 ≈ 9:16 ✓
  { id: 'five-port-916', name: 'Five Portrait 9:16', cells: [
    { x:0.014, y:0.175, w:0.183, h:0.65, hint:'916' },
    { x:0.211, y:0.175, w:0.183, h:0.65, hint:'916' },
    { x:0.408, y:0.175, w:0.183, h:0.65, hint:'916' },
    { x:0.605, y:0.175, w:0.183, h:0.65, hint:'916' },
    { x:0.802, y:0.175, w:0.183, h:0.65, hint:'916' },
  ]},

  // Landscape hero top-left + two 16:9 right + two 4:5 bottom
  { id: 'hero-four-mix', name: 'Hero + 4 Mix', cells: [
    { x:0,    y:0,     w:0.55, h:0.563, hint:'169' },
    { x:0.55, y:0,     w:0.45, h:0.281, hint:'169' },
    { x:0.55, y:0.281, w:0.45, h:0.281, hint:'169' },
    { x:0,    y:0.563, w:0.225,h:0.437, hint:'45'  },
    { x:0.225,y:0.563, w:0.225,h:0.437, hint:'45'  },
  ]},

  // Story 5 — hero top-left + 2 stacked right + 2 bottom
  { id: 'story-5', name: 'Story 5', cells: [
    { x:0,    y:0,     w:0.55, h:0.55,  hint:'169' },
    { x:0.55, y:0,     w:0.45, h:0.275, hint:'45'  },
    { x:0.55, y:0.275, w:0.45, h:0.275, hint:'45'  },
    { x:0,    y:0.55,  w:0.5,  h:0.45,  hint:'169' },
    { x:0.5,  y:0.55,  w:0.5,  h:0.45,  hint:'169' },
  ]},

  // Magazine 5 — narrow left column + wide centre + right stack
  { id: 'magazine-5', name: 'Magazine 5', cells: [
    { x:0,    y:0,    w:0.2,  h:1,    hint:'45'  },
    { x:0.2,  y:0,    w:0.48, h:1,    hint:'45'  },
    { x:0.68, y:0,    w:0.32, h:0.45, hint:'169' },
    { x:0.68, y:0.45, w:0.16, h:0.55, hint:'916' },
    { x:0.84, y:0.45, w:0.16, h:0.55, hint:'916' },
  ]},

  // Wide top + three columns
  { id: 'wide-three-col', name: 'Wide + 3 Col', cells: [
    { x:0,     y:0,    w:1,     h:0.438, hint:'169' },
    { x:0,     y:0.438,w:0.333, h:0.562, hint:'45'  },
    { x:0.333, y:0.438,w:0.334, h:0.562, hint:'45'  },
    { x:0.667, y:0.438,w:0.333, h:0.562, hint:'45'  },
  ]},


  // ══ SIX ═══════════════════════════════════════════════════════════════

  // Six 9:16 portraits at 55 % height, equally spaced
  // (0.155 / 0.55) × 2 = 0.564 ≈ 9:16 ✓
  { id: 'six-port-916', name: 'Six Portrait 9:16', cells: [
    { x:0.01,  y:0.225, w:0.155, h:0.55, hint:'916' },
    { x:0.175, y:0.225, w:0.155, h:0.55, hint:'916' },
    { x:0.34,  y:0.225, w:0.155, h:0.55, hint:'916' },
    { x:0.505, y:0.225, w:0.155, h:0.55, hint:'916' },
    { x:0.67,  y:0.225, w:0.155, h:0.55, hint:'916' },
    { x:0.835, y:0.225, w:0.155, h:0.55, hint:'916' },
  ]},

  // Six 4:5 portraits in 3 × 2 grid
  // Each cell: w=0.333, h for 4:5 = 0.333/0.4 = 0.833 → too tall; use h=0.5 at w=0.2 (4:5 ✓)
  // Adjusted: two rows of three, each w=0.333, h=0.5 → (0.333/0.5)*2=1.333 — landscape-ish
  // For 4:5 grid: w=0.2, h=0.5 → 4:5 ✓, 3 per row with 0.1 margins
  { id: 'six-port-45', name: 'Six Portrait 4:5', cells: [
    { x:0.05,  y:0,   w:0.2,  h:0.5, hint:'45' },
    { x:0.3,   y:0,   w:0.2,  h:0.5, hint:'45' },
    { x:0.55,  y:0,   w:0.2,  h:0.5, hint:'45' },
    { x:0.05,  y:0.5, w:0.2,  h:0.5, hint:'45' },
    { x:0.3,   y:0.5, w:0.2,  h:0.5, hint:'45' },
    { x:0.55,  y:0.5, w:0.2,  h:0.5, hint:'45' },
  ]},

  // Flow 6 — wide top pair + four bottom cells
  { id: 'flow-6', name: 'Flow 6', cells: [
    { x:0,    y:0,   w:0.6,  h:0.5,  hint:'169' },
    { x:0.6,  y:0,   w:0.4,  h:0.5,  hint:'169' },
    { x:0,    y:0.5, w:0.25, h:0.5,  hint:'45'  },
    { x:0.25, y:0.5, w:0.25, h:0.5,  hint:'45'  },
    { x:0.5,  y:0.5, w:0.25, h:0.5,  hint:'45'  },
    { x:0.75, y:0.5, w:0.25, h:0.5,  hint:'45'  },
  ]},


  // ══ SEVEN + ════════════════════════════════════════════════════════════

  { id: 'seven-mosaic', name: 'Seven Mosaic', cells: [
    { x:0,     y:0,   w:0.4,  h:0.5,  hint:'169' },
    { x:0.4,   y:0,   w:0.25, h:0.5,  hint:'45'  },
    { x:0.65,  y:0,   w:0.35, h:0.5,  hint:'169' },
    { x:0,     y:0.5, w:0.183,h:0.5,  hint:'916' },
    { x:0.183, y:0.5, w:0.183,h:0.5,  hint:'916' },
    { x:0.366, y:0.5, w:0.183,h:0.5,  hint:'916' },
    { x:0.549, y:0.5, w:0.451,h:0.5,  hint:'169' },
  ]},

  { id: 'eight-grid', name: 'Eight Grid 4×2', cells: [
    { x:0,     y:0,   w:0.25, h:0.5, hint:'45' },
    { x:0.25,  y:0,   w:0.25, h:0.5, hint:'45' },
    { x:0.5,   y:0,   w:0.25, h:0.5, hint:'45' },
    { x:0.75,  y:0,   w:0.25, h:0.5, hint:'45' },
    { x:0,     y:0.5, w:0.25, h:0.5, hint:'45' },
    { x:0.25,  y:0.5, w:0.25, h:0.5, hint:'45' },
    { x:0.5,   y:0.5, w:0.25, h:0.5, hint:'45' },
    { x:0.75,  y:0.5, w:0.25, h:0.5, hint:'45' },
  ]},

  { id: 'nine-grid', name: 'Nine Grid 3×3', cells: [
    { x:0,     y:0,     w:0.333, h:0.333, hint:'45' },
    { x:0.333, y:0,     w:0.334, h:0.333, hint:'45' },
    { x:0.667, y:0,     w:0.333, h:0.333, hint:'45' },
    { x:0,     y:0.333, w:0.333, h:0.334, hint:'45' },
    { x:0.333, y:0.333, w:0.334, h:0.334, hint:'45' },
    { x:0.667, y:0.333, w:0.333, h:0.334, hint:'45' },
    { x:0,     y:0.667, w:0.333, h:0.333, hint:'45' },
    { x:0.333, y:0.667, w:0.334, h:0.333, hint:'45' },
    { x:0.667, y:0.667, w:0.333, h:0.333, hint:'45' },
  ]},

  // ══ HIGH DENSITY — 12 cells ══════════════════════════════════════════

  // 4 columns × 3 rows — landscape cells
  { id: 'grid-12-4x3', name: '12 Grid 4×3', cells: [
    { x:0,    y:0,     w:0.25, h:0.333, hint:'169' }, { x:0.25, y:0,     w:0.25, h:0.333, hint:'169' },
    { x:0.5,  y:0,     w:0.25, h:0.333, hint:'169' }, { x:0.75, y:0,     w:0.25, h:0.333, hint:'169' },
    { x:0,    y:0.333, w:0.25, h:0.334, hint:'169' }, { x:0.25, y:0.333, w:0.25, h:0.334, hint:'169' },
    { x:0.5,  y:0.333, w:0.25, h:0.334, hint:'169' }, { x:0.75, y:0.333, w:0.25, h:0.334, hint:'169' },
    { x:0,    y:0.667, w:0.25, h:0.333, hint:'169' }, { x:0.25, y:0.667, w:0.25, h:0.333, hint:'169' },
    { x:0.5,  y:0.667, w:0.25, h:0.333, hint:'169' }, { x:0.75, y:0.667, w:0.25, h:0.333, hint:'169' },
  ]},

  // 6 columns × 2 rows — portrait-ish cells
  // (0.167/0.5)×2 = 0.667 ≈ portrait
  { id: 'grid-12-6x2', name: '12 Grid 6×2', cells: [
    { x:0,     y:0,   w:0.167, h:0.5, hint:'45' }, { x:0.167, y:0,   w:0.166, h:0.5, hint:'45' },
    { x:0.333, y:0,   w:0.167, h:0.5, hint:'45' }, { x:0.5,   y:0,   w:0.167, h:0.5, hint:'45' },
    { x:0.667, y:0,   w:0.166, h:0.5, hint:'45' }, { x:0.833, y:0,   w:0.167, h:0.5, hint:'45' },
    { x:0,     y:0.5, w:0.167, h:0.5, hint:'45' }, { x:0.167, y:0.5, w:0.166, h:0.5, hint:'45' },
    { x:0.333, y:0.5, w:0.167, h:0.5, hint:'45' }, { x:0.5,   y:0.5, w:0.167, h:0.5, hint:'45' },
    { x:0.667, y:0.5, w:0.166, h:0.5, hint:'45' }, { x:0.833, y:0.5, w:0.167, h:0.5, hint:'45' },
  ]},

  // ══ HIGH DENSITY — 15 cells ══════════════════════════════════════════

  // 5 columns × 3 rows
  { id: 'grid-15-5x3', name: '15 Grid 5×3', cells: [
    { x:0,   y:0,     w:0.2, h:0.333, hint:'169' }, { x:0.2, y:0,     w:0.2, h:0.333, hint:'169' },
    { x:0.4, y:0,     w:0.2, h:0.333, hint:'169' }, { x:0.6, y:0,     w:0.2, h:0.333, hint:'169' },
    { x:0.8, y:0,     w:0.2, h:0.333, hint:'169' },
    { x:0,   y:0.333, w:0.2, h:0.334, hint:'169' }, { x:0.2, y:0.333, w:0.2, h:0.334, hint:'169' },
    { x:0.4, y:0.333, w:0.2, h:0.334, hint:'169' }, { x:0.6, y:0.333, w:0.2, h:0.334, hint:'169' },
    { x:0.8, y:0.333, w:0.2, h:0.334, hint:'169' },
    { x:0,   y:0.667, w:0.2, h:0.333, hint:'169' }, { x:0.2, y:0.667, w:0.2, h:0.333, hint:'169' },
    { x:0.4, y:0.667, w:0.2, h:0.333, hint:'169' }, { x:0.6, y:0.667, w:0.2, h:0.333, hint:'169' },
    { x:0.8, y:0.667, w:0.2, h:0.333, hint:'169' },
  ]},

  // ══ HIGH DENSITY — 18 cells ══════════════════════════════════════════

  // 6 columns × 3 rows — square cells
  { id: 'grid-18-6x3', name: '18 Grid 6×3', cells: [
    { x:0,     y:0,     w:0.167, h:0.333, hint:'45' }, { x:0.167, y:0,     w:0.167, h:0.333, hint:'45' },
    { x:0.333, y:0,     w:0.167, h:0.333, hint:'45' }, { x:0.5,   y:0,     w:0.167, h:0.333, hint:'45' },
    { x:0.667, y:0,     w:0.166, h:0.333, hint:'45' }, { x:0.833, y:0,     w:0.167, h:0.333, hint:'45' },
    { x:0,     y:0.333, w:0.167, h:0.334, hint:'45' }, { x:0.167, y:0.333, w:0.167, h:0.334, hint:'45' },
    { x:0.333, y:0.333, w:0.167, h:0.334, hint:'45' }, { x:0.5,   y:0.333, w:0.167, h:0.334, hint:'45' },
    { x:0.667, y:0.333, w:0.166, h:0.334, hint:'45' }, { x:0.833, y:0.333, w:0.167, h:0.334, hint:'45' },
    { x:0,     y:0.667, w:0.167, h:0.333, hint:'45' }, { x:0.167, y:0.667, w:0.167, h:0.333, hint:'45' },
    { x:0.333, y:0.667, w:0.167, h:0.333, hint:'45' }, { x:0.5,   y:0.667, w:0.167, h:0.333, hint:'45' },
    { x:0.667, y:0.667, w:0.166, h:0.333, hint:'45' }, { x:0.833, y:0.667, w:0.167, h:0.333, hint:'45' },
  ]},

  // 9 columns × 2 rows — portrait-oriented cells
  // (0.111/0.5)×2 = 0.444 ≈ close to 9:16
  { id: 'grid-18-9x2', name: '18 Grid 9×2', cells: [
    { x:0,     y:0,   w:0.111, h:0.5, hint:'916' }, { x:0.111, y:0,   w:0.111, h:0.5, hint:'916' },
    { x:0.222, y:0,   w:0.111, h:0.5, hint:'916' }, { x:0.333, y:0,   w:0.111, h:0.5, hint:'916' },
    { x:0.444, y:0,   w:0.111, h:0.5, hint:'916' }, { x:0.555, y:0,   w:0.111, h:0.5, hint:'916' },
    { x:0.666, y:0,   w:0.111, h:0.5, hint:'916' }, { x:0.777, y:0,   w:0.111, h:0.5, hint:'916' },
    { x:0.888, y:0,   w:0.112, h:0.5, hint:'916' },
    { x:0,     y:0.5, w:0.111, h:0.5, hint:'916' }, { x:0.111, y:0.5, w:0.111, h:0.5, hint:'916' },
    { x:0.222, y:0.5, w:0.111, h:0.5, hint:'916' }, { x:0.333, y:0.5, w:0.111, h:0.5, hint:'916' },
    { x:0.444, y:0.5, w:0.111, h:0.5, hint:'916' }, { x:0.555, y:0.5, w:0.111, h:0.5, hint:'916' },
    { x:0.666, y:0.5, w:0.111, h:0.5, hint:'916' }, { x:0.777, y:0.5, w:0.111, h:0.5, hint:'916' },
    { x:0.888, y:0.5, w:0.112, h:0.5, hint:'916' },
  ]},

  // Pyramid mosaic 3 + 6 + 9 = 18 (large → medium → small)
  { id: 'grid-18-pyramid', name: '18 Pyramid', cells: [
    // Top row — 3 wide landscape cells
    { x:0,     y:0,    w:0.333, h:0.333, hint:'169' },
    { x:0.333, y:0,    w:0.334, h:0.333, hint:'169' },
    { x:0.667, y:0,    w:0.333, h:0.333, hint:'169' },
    // Middle row — 6 medium cells
    { x:0,     y:0.333, w:0.167, h:0.333, hint:'45' }, { x:0.167, y:0.333, w:0.167, h:0.333, hint:'45' },
    { x:0.333, y:0.333, w:0.167, h:0.333, hint:'45' }, { x:0.5,   y:0.333, w:0.167, h:0.333, hint:'45' },
    { x:0.667, y:0.333, w:0.166, h:0.333, hint:'45' }, { x:0.833, y:0.333, w:0.167, h:0.333, hint:'45' },
    // Bottom row — 9 narrow cells
    { x:0,     y:0.667, w:0.111, h:0.333, hint:'916' }, { x:0.111, y:0.667, w:0.111, h:0.333, hint:'916' },
    { x:0.222, y:0.667, w:0.111, h:0.333, hint:'916' }, { x:0.333, y:0.667, w:0.111, h:0.333, hint:'916' },
    { x:0.444, y:0.667, w:0.111, h:0.333, hint:'916' }, { x:0.555, y:0.667, w:0.111, h:0.333, hint:'916' },
    { x:0.666, y:0.667, w:0.111, h:0.333, hint:'916' }, { x:0.777, y:0.667, w:0.111, h:0.333, hint:'916' },
    { x:0.888, y:0.667, w:0.112, h:0.333, hint:'916' },
  ]},

  // 6 portrait columns × 3 rows — 4:5 portrait cells
  // (0.133/0.333)×2 = 0.8 = 4:5 ✓  — centred with side margins
  { id: 'grid-18-portrait', name: '18 Portrait 4:5', cells: [
    { x:0.1,   y:0,     w:0.133, h:0.333, hint:'45' }, { x:0.233, y:0,     w:0.133, h:0.333, hint:'45' },
    { x:0.367, y:0,     w:0.133, h:0.333, hint:'45' }, { x:0.5,   y:0,     w:0.133, h:0.333, hint:'45' },
    { x:0.633, y:0,     w:0.133, h:0.333, hint:'45' }, { x:0.767, y:0,     w:0.133, h:0.333, hint:'45' },
    { x:0.1,   y:0.333, w:0.133, h:0.334, hint:'45' }, { x:0.233, y:0.333, w:0.133, h:0.334, hint:'45' },
    { x:0.367, y:0.333, w:0.133, h:0.334, hint:'45' }, { x:0.5,   y:0.333, w:0.133, h:0.334, hint:'45' },
    { x:0.633, y:0.333, w:0.133, h:0.334, hint:'45' }, { x:0.767, y:0.333, w:0.133, h:0.334, hint:'45' },
    { x:0.1,   y:0.667, w:0.133, h:0.333, hint:'45' }, { x:0.233, y:0.667, w:0.133, h:0.333, hint:'45' },
    { x:0.367, y:0.667, w:0.133, h:0.333, hint:'45' }, { x:0.5,   y:0.667, w:0.133, h:0.333, hint:'45' },
    { x:0.633, y:0.667, w:0.133, h:0.333, hint:'45' }, { x:0.767, y:0.667, w:0.133, h:0.333, hint:'45' },
  ]},

  // ══ HIGH DENSITY — 20 cells ══════════════════════════════════════════

  // 5 columns × 4 rows
  { id: 'grid-20-5x4', name: '20 Grid 5×4', cells: [
    { x:0,   y:0,    w:0.2, h:0.25, hint:'169' }, { x:0.2, y:0,    w:0.2, h:0.25, hint:'169' },
    { x:0.4, y:0,    w:0.2, h:0.25, hint:'169' }, { x:0.6, y:0,    w:0.2, h:0.25, hint:'169' },
    { x:0.8, y:0,    w:0.2, h:0.25, hint:'169' },
    { x:0,   y:0.25, w:0.2, h:0.25, hint:'169' }, { x:0.2, y:0.25, w:0.2, h:0.25, hint:'169' },
    { x:0.4, y:0.25, w:0.2, h:0.25, hint:'169' }, { x:0.6, y:0.25, w:0.2, h:0.25, hint:'169' },
    { x:0.8, y:0.25, w:0.2, h:0.25, hint:'169' },
    { x:0,   y:0.5,  w:0.2, h:0.25, hint:'169' }, { x:0.2, y:0.5,  w:0.2, h:0.25, hint:'169' },
    { x:0.4, y:0.5,  w:0.2, h:0.25, hint:'169' }, { x:0.6, y:0.5,  w:0.2, h:0.25, hint:'169' },
    { x:0.8, y:0.5,  w:0.2, h:0.25, hint:'169' },
    { x:0,   y:0.75, w:0.2, h:0.25, hint:'169' }, { x:0.2, y:0.75, w:0.2, h:0.25, hint:'169' },
    { x:0.4, y:0.75, w:0.2, h:0.25, hint:'169' }, { x:0.6, y:0.75, w:0.2, h:0.25, hint:'169' },
    { x:0.8, y:0.75, w:0.2, h:0.25, hint:'169' },
  ]},


  // ══ PRINT SIZES — exact aspect ratios for standard print formats ══════
  // Calibrated for 12×6 in spreads at 300 dpi.

  { id: 'print-4x6-portrait-3', name: '4×6 Portrait ×3', printSize: true, cells: [
    { x:0,     y:0, w:0.333, h:1.0, hint:'45' },
    { x:0.333, y:0, w:0.334, h:1.0, hint:'45' },
    { x:0.667, y:0, w:0.333, h:1.0, hint:'45' },
  ]},
  { id: 'print-4x6-land-2', name: '4×6 Landscape ×2', printSize: true, cells: [
    { x:0,   y:0.167, w:0.5, h:0.667, hint:'169' },
    { x:0.5, y:0.167, w:0.5, h:0.667, hint:'169' },
  ]},
  { id: 'print-5x7-land-1', name: '5×7 Landscape ×1', printSize: true, cells: [
    { x:0.208, y:0.083, w:0.583, h:0.833, hint:'169' },
  ]},
  { id: 'print-5x7-land-2', name: '5×7 Landscape ×2', printSize: true, cells: [
    { x:0,   y:0.143, w:0.5, h:0.714, hint:'169' },
    { x:0.5, y:0.143, w:0.5, h:0.714, hint:'169' },
  ]},
  { id: 'print-5x7-portrait-2', name: '5×7 Portrait ×2', printSize: true, cells: [
    { x:0,   y:0, w:0.417, h:1.0, hint:'45' },
    { x:0.5, y:0, w:0.417, h:1.0, hint:'45' },
  ]},
  { id: 'print-wallets-4', name: 'Wallet 2.5×3.5 ×4', printSize: true, cells: [
    { x:0.083, y:0.208, w:0.208, h:0.583, hint:'45' },
    { x:0.292, y:0.208, w:0.208, h:0.583, hint:'45' },
    { x:0.500, y:0.208, w:0.208, h:0.583, hint:'45' },
    { x:0.708, y:0.208, w:0.208, h:0.583, hint:'45' },
  ]},
  { id: 'print-4x6-mix', name: '4×6 Mixed (1L + 2P)', printSize: true, cells: [
    { x:0,    y:0.167, w:0.5,  h:0.667, hint:'169' },
    { x:0.5,  y:0,     w:0.25, h:1.0,   hint:'45'  },
    { x:0.75, y:0,     w:0.25, h:1.0,   hint:'45'  },
  ]},


  // ══ EDITORIAL / ALBUM ════════════════════════════════════════════════
  // Inspired by magazine spreads and square album layouts.

  { id: 'ed-3strips', name: 'Three Strips', cells: [
    { x:0, y:0,     w:1, h:0.333, hint:'169' },
    { x:0, y:0.333, w:1, h:0.334, hint:'169' },
    { x:0, y:0.667, w:1, h:0.333, hint:'169' },
  ]},

  { id: 'ed-stagger-3', name: 'Stagger 3', cells: [
    { x:0,    y:0,    w:0.35, h:0.78, hint:'45'  },
    { x:0.35, y:0.11, w:0.32, h:0.78, hint:'45'  },
    { x:0.67, y:0.22, w:0.33, h:0.78, hint:'45'  },
  ]},

  { id: 'ed-side-hero', name: 'Side Hero', cells: [
    { x:0,   y:0, w:0.3,  h:1, hint:'45'  },
    { x:0.3, y:0, w:0.7,  h:1, hint:'169' },
  ]},

  { id: 'ed-album-4', name: 'Album 4', cells: [
    { x:0,     y:0,   w:0.55,  h:1,   hint:'45'  },
    { x:0.55,  y:0,   w:0.45,  h:0.5, hint:'169' },
    { x:0.55,  y:0.5, w:0.225, h:0.5, hint:'45'  },
    { x:0.775, y:0.5, w:0.225, h:0.5, hint:'45'  },
  ]},

  { id: 'ed-pano-3', name: 'Pano + 3', cells: [
    { x:0,     y:0,    w:1,     h:0.42, hint:'169' },
    { x:0,     y:0.42, w:0.333, h:0.58, hint:'45'  },
    { x:0.333, y:0.42, w:0.334, h:0.58, hint:'45'  },
    { x:0.667, y:0.42, w:0.333, h:0.58, hint:'45'  },
  ]},

  { id: 'ed-asymmetric-4', name: 'Asymmetric 4', cells: [
    { x:0,    y:0,   w:0.62, h:0.6, hint:'169' },
    { x:0.62, y:0,   w:0.38, h:1,   hint:'45'  },
    { x:0,    y:0.6, w:0.38, h:0.4, hint:'45'  },
    { x:0.38, y:0.6, w:0.24, h:0.4, hint:'45'  },
  ]},

  { id: 'ed-story-5', name: 'Story 5', cells: [
    { x:0,    y:0,     w:0.55, h:0.55,  hint:'169' },
    { x:0.55, y:0,     w:0.45, h:0.275, hint:'45'  },
    { x:0.55, y:0.275, w:0.45, h:0.275, hint:'45'  },
    { x:0,    y:0.55,  w:0.5,  h:0.45,  hint:'169' },
    { x:0.5,  y:0.55,  w:0.5,  h:0.45,  hint:'169' },
  ]},

  { id: 'ed-magazine-5', name: 'Magazine 5', cells: [
    { x:0,    y:0,    w:0.2,  h:1,    hint:'45'  },
    { x:0.2,  y:0,    w:0.48, h:1,    hint:'45'  },
    { x:0.68, y:0,    w:0.32, h:0.45, hint:'169' },
    { x:0.68, y:0.45, w:0.16, h:0.55, hint:'916' },
    { x:0.84, y:0.45, w:0.16, h:0.55, hint:'916' },
  ]},

  { id: 'ed-flow-6', name: 'Flow 6', cells: [
    { x:0,    y:0,   w:0.6,  h:0.5, hint:'169' },
    { x:0.6,  y:0,   w:0.4,  h:0.5, hint:'169' },
    { x:0,    y:0.5, w:0.3,  h:0.5, hint:'45'  },
    { x:0.3,  y:0.5, w:0.3,  h:0.5, hint:'45'  },
    { x:0.6,  y:0.5, w:0.2,  h:0.5, hint:'45'  },
    { x:0.8,  y:0.5, w:0.2,  h:0.5, hint:'45'  },
  ]},

  { id: 'ed-hero-5col', name: 'Hero + 5 Col', cells: [
    { x:0,    y:0,   w:0.5,  h:0.6, hint:'169' },
    { x:0.5,  y:0,   w:0.5,  h:0.6, hint:'169' },
    { x:0,    y:0.6, w:0.2,  h:0.4, hint:'45'  },
    { x:0.2,  y:0.6, w:0.2,  h:0.4, hint:'45'  },
    { x:0.4,  y:0.6, w:0.2,  h:0.4, hint:'45'  },
    { x:0.6,  y:0.6, w:0.2,  h:0.4, hint:'45'  },
    { x:0.8,  y:0.6, w:0.2,  h:0.4, hint:'45'  },
  ]},


  // ══ WEDDING & EVENT ══════════════════════════════════════════════════
  // Layouts designed for ceremony, portraits, reception, getting-ready,
  // and event coverage. All dimensions follow the 2:1 spread ratio.

  // ── Ceremony ──────────────────────────────────────────────────────────

  { id: 'wed-ceremony-arrival', name: 'Ceremony Arrival', category: 'Wedding', cells: [
    { x:0,     y:0,    w:1,    h:0.42,  hint:'169' },
    { x:0.033, y:0.45, w:0.28, h:0.55,  hint:'916' },
    { x:0.36,  y:0.45, w:0.28, h:0.55,  hint:'916' },
    { x:0.687, y:0.45, w:0.28, h:0.55,  hint:'916' },
  ]},

  { id: 'wed-vows', name: 'Vows Moment', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.6,  h:1,    hint:'169' },
    { x:0.62, y:0,    w:0.38, h:0.32, hint:'169' },
    { x:0.62, y:0.34, w:0.38, h:0.32, hint:'169' },
    { x:0.62, y:0.68, w:0.38, h:0.32, hint:'169' },
  ]},

  { id: 'wed-aisle', name: 'Down The Aisle', category: 'Wedding', cells: [
    { x:0,    y:0, w:0.25, h:1, hint:'45' },
    { x:0.27, y:0, w:0.46, h:1, hint:'45' },
    { x:0.75, y:0, w:0.25, h:1, hint:'45' },
  ]},

  { id: 'wed-rings', name: 'Ring & Detail', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.4,  h:0.5,  hint:'169' },
    { x:0.42, y:0,    w:0.58, h:1,    hint:'45'  },
    { x:0,    y:0.52, w:0.4,  h:0.48, hint:'169' },
  ]},

  { id: 'wed-ceremony-wide', name: 'Ceremony Wide', category: 'Wedding', cells: [
    { x:0, y:0,    w:1, h:0.49, hint:'169' },
    { x:0, y:0.51, w:1, h:0.49, hint:'169' },
  ]},

  // ── Portraits ──────────────────────────────────────────────────────────

  { id: 'wed-couple-diptych', name: 'Couple Diptych', category: 'Wedding', cells: [
    { x:0,    y:0, w:0.49, h:1, hint:'45' },
    { x:0.51, y:0, w:0.49, h:1, hint:'45' },
  ]},

  { id: 'wed-portrait-hero', name: 'Portrait Hero', category: 'Wedding', cells: [
    { x:0.1,  y:0,    w:0.55, h:1,    hint:'45' },
    { x:0.68, y:0,    w:0.16, h:0.49, hint:'45' },
    { x:0.68, y:0.51, w:0.16, h:0.49, hint:'45' },
  ]},

  { id: 'wed-bridal-trio', name: 'Bridal Party Trio', category: 'Wedding', cells: [
    { x:0.04, y:0, w:0.3, h:1, hint:'45' },
    { x:0.37, y:0, w:0.3, h:1, hint:'45' },
    { x:0.7,  y:0, w:0.3, h:1, hint:'45' },
  ]},

  { id: 'wed-portrait-group', name: 'Group + Portraits', category: 'Wedding', cells: [
    { x:0,    y:0,    w:1,    h:0.52, hint:'169' },
    { x:0,    y:0.54, w:0.24, h:0.46, hint:'45'  },
    { x:0.26, y:0.54, w:0.24, h:0.46, hint:'45'  },
    { x:0.52, y:0.54, w:0.24, h:0.46, hint:'45'  },
    { x:0.78, y:0.54, w:0.22, h:0.46, hint:'45'  },
  ]},

  { id: 'wed-stagger-4port', name: 'Staggered 4 Portrait', category: 'Wedding', cells: [
    { x:0,    y:0.1,  w:0.24, h:0.8,  hint:'45' },
    { x:0.26, y:0,    w:0.24, h:0.8,  hint:'45' },
    { x:0.52, y:0.1,  w:0.24, h:0.8,  hint:'45' },
    { x:0.78, y:0,    w:0.22, h:0.9,  hint:'45' },
  ]},

  // ── Reception ──────────────────────────────────────────────────────────

  { id: 'wed-first-dance', name: 'First Dance', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.62, h:1,    hint:'169' },
    { x:0.64, y:0,    w:0.36, h:0.49, hint:'45'  },
    { x:0.64, y:0.51, w:0.36, h:0.49, hint:'45'  },
  ]},

  { id: 'wed-reception-candid', name: 'Reception Candid', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.4,  h:0.5,  hint:'169' },
    { x:0.42, y:0,    w:0.58, h:0.5,  hint:'169' },
    { x:0,    y:0.52, w:0.2,  h:0.48, hint:'45'  },
    { x:0.22, y:0.52, w:0.2,  h:0.48, hint:'45'  },
    { x:0.44, y:0.52, w:0.2,  h:0.48, hint:'45'  },
    { x:0.66, y:0.52, w:0.34, h:0.48, hint:'169' },
  ]},

  { id: 'wed-speeches', name: 'Speeches & Toast', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.55, h:0.58, hint:'169' },
    { x:0.57, y:0,    w:0.43, h:0.3,  hint:'169' },
    { x:0.57, y:0.32, w:0.21, h:0.68, hint:'45'  },
    { x:0.8,  y:0.32, w:0.2,  h:0.68, hint:'45'  },
    { x:0,    y:0.6,  w:0.55, h:0.4,  hint:'169' },
  ]},

  { id: 'wed-cake-cutting', name: 'Cake & Details', category: 'Wedding', cells: [
    { x:0.2,  y:0,    w:0.6,  h:1,    hint:'45' },
    { x:0,    y:0,    w:0.18, h:0.49, hint:'45' },
    { x:0,    y:0.51, w:0.18, h:0.49, hint:'45' },
    { x:0.82, y:0,    w:0.18, h:0.49, hint:'45' },
    { x:0.82, y:0.51, w:0.18, h:0.49, hint:'45' },
  ]},

  // ── Getting Ready ──────────────────────────────────────────────────────

  { id: 'wed-getting-ready', name: 'Getting Ready', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.4,  h:0.58, hint:'45'  },
    { x:0.42, y:0,    w:0.58, h:0.38, hint:'169' },
    { x:0.42, y:0.4,  w:0.29, h:0.6,  hint:'45'  },
    { x:0.73, y:0.4,  w:0.27, h:0.6,  hint:'45'  },
    { x:0,    y:0.6,  w:0.2,  h:0.4,  hint:'45'  },
    { x:0.22, y:0.6,  w:0.18, h:0.4,  hint:'45'  },
  ]},

  { id: 'wed-bridal-detail', name: 'Bridal Details', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.5,  h:1,    hint:'45'  },
    { x:0.52, y:0,    w:0.48, h:0.48, hint:'169' },
    { x:0.52, y:0.52, w:0.23, h:0.48, hint:'45'  },
    { x:0.77, y:0.52, w:0.23, h:0.48, hint:'45'  },
  ]},

  // ── Editorial Wedding ──────────────────────────────────────────────────

  { id: 'wed-editorial-1', name: 'Wed Editorial I', category: 'Wedding', cells: [
    { x:0,    y:0,    w:0.38, h:1,    hint:'45'  },
    { x:0.4,  y:0,    w:0.6,  h:0.53, hint:'169' },
    { x:0.4,  y:0.55, w:0.3,  h:0.45, hint:'169' },
    { x:0.72, y:0.55, w:0.28, h:0.45, hint:'169' },
  ]},

  { id: 'wed-editorial-2', name: 'Wed Editorial II', category: 'Wedding', cells: [
    { x:0,    y:0.12, w:0.23, h:0.8,  hint:'45' },
    { x:0.25, y:0,    w:0.23, h:0.8,  hint:'45' },
    { x:0.5,  y:0.12, w:0.23, h:0.8,  hint:'45' },
    { x:0.75, y:0,    w:0.25, h:1,    hint:'45' },
  ]},

  { id: 'wed-farewell', name: 'Grand Exit', category: 'Wedding', cells: [
    { x:0,    y:0,    w:1,    h:0.45, hint:'169' },
    { x:0,    y:0.47, w:0.24, h:0.53, hint:'45'  },
    { x:0.26, y:0.47, w:0.24, h:0.53, hint:'45'  },
    { x:0.52, y:0.47, w:0.24, h:0.53, hint:'45'  },
    { x:0.78, y:0.47, w:0.22, h:0.53, hint:'45'  },
  ]},

  // ── Event ──────────────────────────────────────────────────────────────

  { id: 'event-timeline-3', name: 'Event Timeline', category: 'Event', cells: [
    { x:0,    y:0.08, w:0.32, h:0.84, hint:'45' },
    { x:0.34, y:0,    w:0.32, h:0.84, hint:'45' },
    { x:0.68, y:0.08, w:0.32, h:0.84, hint:'45' },
  ]},

  { id: 'event-mosaic-8', name: 'Event Mosaic 8', category: 'Event', cells: [
    { x:0,    y:0,    w:0.3,  h:0.55, hint:'45'  },
    { x:0.32, y:0,    w:0.4,  h:0.55, hint:'169' },
    { x:0.74, y:0,    w:0.26, h:0.55, hint:'45'  },
    { x:0,    y:0.57, w:0.2,  h:0.43, hint:'45'  },
    { x:0.22, y:0.57, w:0.2,  h:0.43, hint:'45'  },
    { x:0.44, y:0.57, w:0.2,  h:0.43, hint:'45'  },
    { x:0.66, y:0.57, w:0.2,  h:0.43, hint:'45'  },
    { x:0.88, y:0.57, w:0.12, h:0.43, hint:'45'  },
  ]},

  { id: 'event-stage-hero', name: 'Stage Hero', category: 'Event', cells: [
    { x:0,    y:0,    w:0.68, h:1,    hint:'169' },
    { x:0.7,  y:0,    w:0.3,  h:0.32, hint:'45'  },
    { x:0.7,  y:0.34, w:0.3,  h:0.32, hint:'45'  },
    { x:0.7,  y:0.68, w:0.3,  h:0.32, hint:'45'  },
  ]},

  { id: 'event-portrait-wall', name: 'Portrait Wall', category: 'Event', cells: [
    { x:0,     y:0,   w:0.111, h:0.5, hint:'45' }, { x:0.111, y:0,   w:0.111, h:0.5, hint:'45' },
    { x:0.222, y:0,   w:0.111, h:0.5, hint:'45' }, { x:0.333, y:0,   w:0.111, h:0.5, hint:'45' },
    { x:0.444, y:0,   w:0.111, h:0.5, hint:'45' }, { x:0.555, y:0,   w:0.111, h:0.5, hint:'45' },
    { x:0.666, y:0,   w:0.111, h:0.5, hint:'45' }, { x:0.777, y:0,   w:0.111, h:0.5, hint:'45' },
    { x:0.888, y:0,   w:0.112, h:0.5, hint:'45' },
    { x:0,     y:0.5, w:0.111, h:0.5, hint:'45' }, { x:0.111, y:0.5, w:0.111, h:0.5, hint:'45' },
    { x:0.222, y:0.5, w:0.111, h:0.5, hint:'45' }, { x:0.333, y:0.5, w:0.111, h:0.5, hint:'45' },
    { x:0.444, y:0.5, w:0.111, h:0.5, hint:'45' }, { x:0.555, y:0.5, w:0.111, h:0.5, hint:'45' },
    { x:0.666, y:0.5, w:0.111, h:0.5, hint:'45' }, { x:0.777, y:0.5, w:0.111, h:0.5, hint:'45' },
    { x:0.888, y:0.5, w:0.112, h:0.5, hint:'45' },
  ]},

  // ══ EDITORIAL WEDDING / STORYBOOK PATTERNS ═════════════════════════
  // 4–9 cell layouts modeled on classic wedding photobook spreads.
  // No category so they're picked up by progressive / editorial pickers.

  { id: 'ed-diptych-pair', name: 'Diptych Pair', cells: [
    { x:0,    y:0,    w:0.5,  h:1     },
    { x:0.5,  y:0,    w:0.5,  h:1     },
  ]},

  { id: 'ed-hero-trio-r', name: 'Hero + Trio R', cells: [
    { x:0,    y:0,     w:0.5,  h:1     },
    { x:0.5,  y:0,     w:0.5,  h:0.333 },
    { x:0.5,  y:0.333, w:0.5,  h:0.333 },
    { x:0.5,  y:0.666, w:0.5,  h:0.334 },
  ]},

  { id: 'ed-hero-trio-l', name: 'Hero + Trio L', cells: [
    { x:0,    y:0,     w:0.5,  h:0.333 },
    { x:0,    y:0.333, w:0.5,  h:0.333 },
    { x:0,    y:0.666, w:0.5,  h:0.334 },
    { x:0.5,  y:0,     w:0.5,  h:1     },
  ]},

  { id: 'ed-hero-strip-bot', name: 'Hero + Strip ↓', cells: [
    { x:0,     y:0,    w:1,     h:0.7  },
    { x:0,     y:0.7,  w:0.333, h:0.3  },
    { x:0.333, y:0.7,  w:0.334, h:0.3  },
    { x:0.667, y:0.7,  w:0.333, h:0.3  },
  ]},

  { id: 'ed-hero-strip-top', name: 'Strip + Hero ↑', cells: [
    { x:0,     y:0,    w:0.333, h:0.3  },
    { x:0.333, y:0,    w:0.334, h:0.3  },
    { x:0.667, y:0,    w:0.333, h:0.3  },
    { x:0,     y:0.3,  w:1,     h:0.7  },
  ]},

  { id: 'ed-quad-asym', name: 'Quad Asymmetric', cells: [
    { x:0,    y:0,    w:0.4,  h:0.5  },
    { x:0,    y:0.5,  w:0.4,  h:0.5  },
    { x:0.4,  y:0,    w:0.6,  h:0.65 },
    { x:0.4,  y:0.65, w:0.6,  h:0.35 },
  ]},

  { id: 'ed-five-corner', name: 'Five Mosaic', cells: [
    { x:0,    y:0,    w:0.25, h:0.5  },
    { x:0,    y:0.5,  w:0.25, h:0.5  },
    { x:0.25, y:0,    w:0.5,  h:1    },
    { x:0.75, y:0,    w:0.25, h:0.5  },
    { x:0.75, y:0.5,  w:0.25, h:0.5  },
  ]},

  { id: 'ed-stack-hero', name: 'Stack + Hero', cells: [
    { x:0,    y:0,    w:0.4,  h:0.5 },
    { x:0,    y:0.5,  w:0.4,  h:0.5 },
    { x:0.4,  y:0,    w:0.6,  h:1   },
  ]},

  { id: 'ed-editorial-6', name: 'Editorial Six', cells: [
    { x:0,    y:0,    w:0.5,  h:0.5 },
    { x:0.5,  y:0,    w:0.25, h:0.5 },
    { x:0.75, y:0,    w:0.25, h:0.5 },
    { x:0,    y:0.5,  w:0.25, h:0.5 },
    { x:0.25, y:0.5,  w:0.25, h:0.5 },
    { x:0.5,  y:0.5,  w:0.5,  h:0.5 },
  ]},

  { id: 'ed-wedding-story', name: 'Wedding Story', cells: [
    { x:0,    y:0,    w:0.2,  h:0.5  },
    { x:0,    y:0.5,  w:0.2,  h:0.5  },
    { x:0.2,  y:0,    w:0.3,  h:1    },
    { x:0.5,  y:0,    w:0.5,  h:0.5  },
    { x:0.5,  y:0.5,  w:0.25, h:0.5  },
    { x:0.75, y:0.5,  w:0.25, h:0.25 },
    { x:0.75, y:0.75, w:0.25, h:0.25 },
  ]},

  // ══ COVER TEMPLATES ═════════════════════════════════════════════════
  // Pre-styled covers: bgColor + cell + captions are all applied on click.
  // Every text element is editable — double-click to change text, single
  // click to drag / restyle via the floating caption toolbar.

  // 1. Arch Romance — based on the "Jim & Pam" reference
  { id: 'cover-arch-romance', name: 'Arch Romance', category: 'Cover',
    bgColor: '#e8e1d2',
    cells: [{ x: 0.18, y: 0.12, w: 0.64, h: 0.46, hint: '45' }],
    captions: [
      { x: 0.44, y: 0.04, w: 0.12, text: '01\n05\n22', fontSize: 26, color: '#3a3a2e', align: 'center', fontFamily: 'Georgia, serif', lineHeight: 1.1 },
      { x: 0.10, y: 0.62, w: 0.80, text: 'Jim & Pam', fontSize: 86, color: '#3a3a2e', align: 'center', fontFamily: 'Georgia, serif', italic: false, bold: false },
      { x: 0.22, y: 0.79, w: 0.56, text: '"I am certain of our love, I love you.\nYou made me believe that love exists\nand I will be by your side forever."', fontSize: 16, color: '#5a5a4a', align: 'center', fontFamily: 'Georgia, serif', italic: true, lineHeight: 1.5 },
      { x: 0.35, y: 0.93, w: 0.30, text: 'Our Wedding', fontSize: 14, color: '#3a3a2e', align: 'center', fontFamily: 'Georgia, serif', letterSpacing: 2 },
    ],
  },

  // 2. Bold Letterspace — based on the "Felicity & Anthony" reference
  { id: 'cover-bold-letterspace', name: 'Bold Letterspace', category: 'Cover',
    bgColor: '#1a1a1a',
    cells: [{ x: 0, y: 0, w: 1, h: 1, hint: '169' }],
    captions: [
      { x: 0.15, y: 0.16, w: 0.70, text: '3 · 30 · 2025', fontSize: 26, color: '#ffffff', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 8, shadow: true },
      { x: 0.10, y: 0.24, w: 0.80, text: 'FELICITY', fontSize: 76, color: '#ffffff', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 14, shadow: true },
      { x: 0.40, y: 0.35, w: 0.20, text: '— & —', fontSize: 22, color: '#ffffff', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 4, shadow: true },
      { x: 0.10, y: 0.40, w: 0.80, text: 'ANTHONY', fontSize: 76, color: '#ffffff', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 14, shadow: true },
    ],
  },

  // 3. Side Editorial — photo right half, text left
  { id: 'cover-side-editorial', name: 'Side Editorial', category: 'Cover',
    bgColor: '#f5f0e6',
    cells: [{ x: 0.5, y: 0, w: 0.5, h: 1, hint: '169' }],
    captions: [
      { x: 0.05, y: 0.10, w: 0.40, text: 'CHAPTER\nONE', fontSize: 16, color: '#888', align: 'left', fontFamily: 'Helvetica, sans-serif', letterSpacing: 4, lineHeight: 1.4 },
      { x: 0.05, y: 0.32, w: 0.42, text: 'Our\nStory', fontSize: 96, color: '#2a2a2a', align: 'left', fontFamily: 'Georgia, serif', lineHeight: 0.95 },
      { x: 0.05, y: 0.74, w: 0.42, text: 'A photobook by the family\n— 2026 edition', fontSize: 16, color: '#666', align: 'left', fontFamily: 'Georgia, serif', italic: true, lineHeight: 1.5 },
    ],
  },

  // 4. Minimal Bottom — photo top 2/3, text below
  { id: 'cover-minimal-bottom', name: 'Minimal Bottom', category: 'Cover',
    bgColor: '#ffffff',
    cells: [{ x: 0, y: 0, w: 1, h: 0.72, hint: '169' }],
    captions: [
      { x: 0.10, y: 0.77, w: 0.80, text: 'Memories', fontSize: 64, color: '#1a1a1a', align: 'center', fontFamily: 'Georgia, serif' },
      { x: 0.30, y: 0.90, w: 0.40, text: '— 2025 —', fontSize: 16, color: '#888', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 6 },
    ],
  },

  // 5. Grand Script — full bleed photo with overlay title
  { id: 'cover-grand-script', name: 'Grand Script', category: 'Cover',
    bgColor: '#1a1a1a',
    cells: [{ x: 0, y: 0, w: 1, h: 1, hint: '169' }],
    captions: [
      { x: 0.10, y: 0.40, w: 0.80, text: 'Forever', fontSize: 140, color: '#ffffff', align: 'center', fontFamily: 'Georgia, serif', italic: true, shadow: true },
      { x: 0.30, y: 0.62, w: 0.40, text: 'OUR JOURNEY · 2026', fontSize: 14, color: '#ffffff', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 6, shadow: true },
    ],
  },

  // 6. Date Card — date as the hero, photo as backdrop
  { id: 'cover-date-card', name: 'Date Card', category: 'Cover',
    bgColor: '#0a0a0a',
    cells: [{ x: 0, y: 0, w: 1, h: 1, hint: '169' }],
    captions: [
      { x: 0.10, y: 0.30, w: 0.80, text: 'TWELVE\nNIGHTS', fontSize: 64, color: '#ffffff', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 10, lineHeight: 1.05, shadow: true },
      { x: 0.30, y: 0.58, w: 0.40, text: 'A holiday photobook\nDecember 2025', fontSize: 15, color: '#ddd', align: 'center', fontFamily: 'Georgia, serif', italic: true, lineHeight: 1.55, shadow: true },
    ],
  },

  // 7. Photo Collage — green-themed mood-board cover with 4 photos arranged
  //    around a tall hero column. Inspired by botanical / wedding mood-boards.
  { id: 'cover-photo-collage', name: 'Photo Collage', category: 'Cover',
    bgColor: '#ffffff',
    cells: [
      { x: 0.32, y: 0.04, w: 0.30, h: 0.92, hint: '34' },   // tall hero center
      { x: 0.04, y: 0.32, w: 0.26, h: 0.36, hint: '11' },   // mid-left
      { x: 0.66, y: 0.16, w: 0.30, h: 0.30, hint: '43' },   // upper-right
      { x: 0.66, y: 0.50, w: 0.30, h: 0.34, hint: '11' },   // lower-right
    ],
    captions: [
      { x: 0.04, y: 0.06, w: 0.24, text: 'PHOTO', fontSize: 38, color: '#2a3a2a', align: 'left', fontFamily: 'Helvetica, sans-serif', bold: true, letterSpacing: 1 },
      { x: 0.04, y: 0.14, w: 0.24, text: 'Collage', fontSize: 28, color: '#5a8a5a', align: 'left', fontFamily: 'Great Vibes, cursive', italic: true },
      { x: 0.04, y: 0.86, w: 0.24, text: '●  ●  ●  ●', fontSize: 24, color: '#5a8a5a', align: 'left', letterSpacing: 6 },
      { x: 0.78, y: 0.06, w: 0.18, text: '△ ▽ △ ▽', fontSize: 14, color: '#9bb89b', align: 'right', fontFamily: 'Helvetica, sans-serif', letterSpacing: 3 },
      { x: 0.78, y: 0.90, w: 0.18, text: '△ ▽ △ ▽', fontSize: 14, color: '#9bb89b', align: 'right', fontFamily: 'Helvetica, sans-serif', letterSpacing: 3 },
    ],
  },

  // 8. The Millers — family snapshot album. Single hero photo on top,
  //    surname + tagline on a single line below with a thin divider.
  { id: 'cover-family-millers', name: 'Family Album', category: 'Cover',
    bgColor: '#ffffff',
    cells: [{ x: 0.08, y: 0.10, w: 0.84, h: 0.62, hint: '43' }],
    captions: [
      { x: 0.10, y: 0.80, w: 0.40, text: 'THE MILLERS', fontSize: 30, color: '#3a3a3a', align: 'left', fontFamily: 'Cormorant Garamond, serif', letterSpacing: 4 },
      { x: 0.52, y: 0.82, w: 0.10, text: '——', fontSize: 22, color: '#aaaaaa', align: 'left' },
      { x: 0.62, y: 0.83, w: 0.32, text: 'our life in snapshots', fontSize: 16, color: '#7a7a7a', align: 'left', fontFamily: 'Cormorant Garamond, serif', italic: true },
    ],
  },

  // 9. Erin (Baby) — newborn cover. Photo fills the top 2/3, peach band
  //    fills the bottom 1/3 carrying the name in script + a soft subtitle.
  { id: 'cover-newborn-erin', name: 'Newborn', category: 'Cover',
    bgColor: '#f4dcc8',
    cells: [{ x: 0, y: 0, w: 1, h: 0.66, hint: '169' }],
    captions: [
      { x: 0.20, y: 0.74, w: 0.60, text: 'Erin', fontSize: 80, color: '#5a4a3a', align: 'center', fontFamily: 'Great Vibes, cursive', italic: true },
      { x: 0.20, y: 0.90, w: 0.60, text: 'Our dearest baby bear', fontSize: 16, color: '#7a6a5a', align: 'center', fontFamily: 'Cormorant Garamond, serif', italic: true, letterSpacing: 1 },
    ],
  },

  // 10. Island Escape — travel cover. 6 photos in a 3×2 grid framing a
  //     white band that carries the destination title + subtitle.
  { id: 'cover-island-escape', name: 'Travel Grid', category: 'Cover',
    bgColor: '#ffffff',
    cells: [
      // Top row
      { x: 0.04, y: 0.06, w: 0.30, h: 0.32, hint: '43' },
      { x: 0.35, y: 0.06, w: 0.30, h: 0.32, hint: '43' },
      { x: 0.66, y: 0.06, w: 0.30, h: 0.32, hint: '43' },
      // Bottom row
      { x: 0.04, y: 0.62, w: 0.30, h: 0.32, hint: '43' },
      { x: 0.35, y: 0.62, w: 0.30, h: 0.32, hint: '43' },
      { x: 0.66, y: 0.62, w: 0.30, h: 0.32, hint: '43' },
    ],
    captions: [
      { x: 0.10, y: 0.45, w: 0.80, text: 'Island Escape', fontSize: 56, color: '#2a3540', align: 'center', fontFamily: 'Helvetica, sans-serif' },
      { x: 0.20, y: 0.55, w: 0.60, text: 'Backpacking in the Philippines', fontSize: 18, color: '#5a6570', align: 'center', fontFamily: 'Helvetica, sans-serif', letterSpacing: 1 },
    ],
  },

  // 11. Europe — bold-typography travel cover. Huge destination name at
  //     the top, single hero photo centered, soft tagline below.
  { id: 'cover-europe-bold', name: 'Bold Destination', category: 'Cover',
    bgColor: '#d8d2c4',
    cells: [{ x: 0.10, y: 0.32, w: 0.80, h: 0.52, hint: '43' }],
    captions: [
      { x: 0.05, y: 0.06, w: 0.90, text: 'EUROPE', fontSize: 140, color: '#8a8478', align: 'center', fontFamily: 'Helvetica, sans-serif', bold: false, letterSpacing: 6 },
      { x: 0.20, y: 0.90, w: 0.60, text: 'A Tour of the Old World', fontSize: 18, color: '#6a6458', align: 'center', fontFamily: 'Cormorant Garamond, serif', italic: true, letterSpacing: 2 },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════
  // ══ EVENT PACKS — new categories for Tier 4                          ══
  // ══════════════════════════════════════════════════════════════════════

  // ──── ENGAGEMENT ────────────────────────────────────────────────────
  { id: 'eng-first-portrait', name: 'The First Portrait', category: 'Engagement', cells: [
    { x: 0.10, y: 0.05, w: 0.80, h: 0.90, hint: '45' },
  ]},
  { id: 'eng-close-away', name: 'Close & Away', category: 'Engagement', cells: [
    { x: 0.03, y: 0.10, w: 0.42, h: 0.80, hint: '45' },
    { x: 0.55, y: 0.10, w: 0.42, h: 0.80, hint: '45' },
  ]},
  { id: 'eng-ring-triptych', name: 'The Ring Triptych', category: 'Engagement', cells: [
    { x: 0.02, y: 0.14, w: 0.30, h: 0.72, hint: '45' },
    { x: 0.35, y: 0.05, w: 0.30, h: 0.90, hint: '45' },
    { x: 0.68, y: 0.14, w: 0.30, h: 0.72, hint: '45' },
  ]},
  { id: 'eng-story-strip', name: 'Story Strip', category: 'Engagement', cells: [
    { x: 0.00, y: 0.35, w: 0.32, h: 0.30, hint: '169' },
    { x: 0.34, y: 0.35, w: 0.32, h: 0.30, hint: '169' },
    { x: 0.68, y: 0.35, w: 0.32, h: 0.30, hint: '169' },
  ]},

  // ──── BABY SHOWER ───────────────────────────────────────────────────
  { id: 'baby-hero-solo', name: 'Little One', category: 'Baby Shower', cells: [
    { x: 0.20, y: 0.06, w: 0.60, h: 0.88, hint: '45' },
  ]},
  { id: 'baby-cake-and-guests', name: 'Cake + Guests', category: 'Baby Shower', cells: [
    { x: 0.02, y: 0.06, w: 0.48, h: 0.88, hint: '45' },
    { x: 0.52, y: 0.06, w: 0.46, h: 0.42, hint: '169' },
    { x: 0.52, y: 0.52, w: 0.46, h: 0.42, hint: '169' },
  ]},
  { id: 'baby-details-quad', name: 'Shower Details Grid', category: 'Baby Shower', cells: [
    { x: 0.02, y: 0.05, w: 0.47, h: 0.44, hint: '43' },
    { x: 0.51, y: 0.05, w: 0.47, h: 0.44, hint: '43' },
    { x: 0.02, y: 0.51, w: 0.47, h: 0.44, hint: '43' },
    { x: 0.51, y: 0.51, w: 0.47, h: 0.44, hint: '43' },
  ]},
  { id: 'baby-name-reveal', name: 'Name Reveal', category: 'Baby Shower', cells: [
    { x: 0.06, y: 0.08, w: 0.88, h: 0.60, hint: '169' },
    { x: 0.20, y: 0.72, w: 0.28, h: 0.24, hint: '11' },
    { x: 0.52, y: 0.72, w: 0.28, h: 0.24, hint: '11' },
  ]},

  // ──── BIRTHDAY ──────────────────────────────────────────────────────
  { id: 'bday-hero-cake', name: 'The Cake Moment', category: 'Birthday', cells: [
    { x: 0.05, y: 0.05, w: 0.90, h: 0.90, hint: '169' },
  ]},
  { id: 'bday-guests-collage', name: 'Guest Collage', category: 'Birthday', cells: [
    { x: 0.02, y: 0.04, w: 0.30, h: 0.44, hint: '43' },
    { x: 0.34, y: 0.04, w: 0.30, h: 0.44, hint: '43' },
    { x: 0.66, y: 0.04, w: 0.32, h: 0.44, hint: '43' },
    { x: 0.02, y: 0.52, w: 0.46, h: 0.44, hint: '169' },
    { x: 0.50, y: 0.52, w: 0.48, h: 0.44, hint: '169' },
  ]},
  { id: 'bday-solo-portrait-quote', name: 'Portrait with Quote', category: 'Birthday', cells: [
    { x: 0.06, y: 0.10, w: 0.50, h: 0.80, hint: '45' },
  ],
    captions: [
      { x: 0.60, y: 0.30, w: 0.36, text: 'ANOTHER TRIP AROUND THE SUN', fontSize: 22, color: '#8a5a20', align: 'left', fontFamily: 'Playfair Display, serif', bold: true, letterSpacing: 2 },
      { x: 0.60, y: 0.55, w: 0.36, text: 'Grateful for every memory.', fontSize: 14, color: '#a8845a', align: 'left', fontFamily: 'Cormorant Garamond, serif', italic: true },
    ],
  },
  { id: 'bday-candles-detail', name: 'Candles & Details', category: 'Birthday', cells: [
    { x: 0.05, y: 0.06, w: 0.55, h: 0.88, hint: '45' },
    { x: 0.63, y: 0.06, w: 0.32, h: 0.42, hint: '11' },
    { x: 0.63, y: 0.52, w: 0.32, h: 0.42, hint: '11' },
  ]},

  // ──── CORPORATE YEARBOOK ────────────────────────────────────────────
  { id: 'corp-team-hero', name: 'Team Portrait Hero', category: 'Corporate', cells: [
    { x: 0.05, y: 0.10, w: 0.90, h: 0.80, hint: '169' },
  ]},
  { id: 'corp-milestones-quad', name: 'Milestones Grid', category: 'Corporate', cells: [
    { x: 0.02, y: 0.04, w: 0.47, h: 0.44, hint: '169' },
    { x: 0.51, y: 0.04, w: 0.47, h: 0.44, hint: '169' },
    { x: 0.02, y: 0.52, w: 0.47, h: 0.44, hint: '169' },
    { x: 0.51, y: 0.52, w: 0.47, h: 0.44, hint: '169' },
  ]},
  { id: 'corp-timeline-row', name: 'Timeline Strip', category: 'Corporate', cells: [
    { x: 0.00, y: 0.30, w: 0.25, h: 0.40, hint: '43' },
    { x: 0.25, y: 0.30, w: 0.25, h: 0.40, hint: '43' },
    { x: 0.50, y: 0.30, w: 0.25, h: 0.40, hint: '43' },
    { x: 0.75, y: 0.30, w: 0.25, h: 0.40, hint: '43' },
  ]},
  { id: 'corp-office-and-team', name: 'Office + Team', category: 'Corporate', cells: [
    { x: 0.02, y: 0.06, w: 0.60, h: 0.88, hint: '169' },
    { x: 0.65, y: 0.06, w: 0.33, h: 0.42, hint: '11' },
    { x: 0.65, y: 0.52, w: 0.33, h: 0.42, hint: '11' },
  ]},

  // ──── FUNERAL / MEMORIAL — dignified, faith-friendly ────────────────
  { id: 'mem-solo-portrait', name: 'Portrait in Repose', category: 'Memorial', cells: [
    { x: 0.30, y: 0.10, w: 0.40, h: 0.80, hint: '45' },
  ],
    captions: [
      { x: 0.10, y: 0.02, w: 0.80, text: 'In Loving Memory', fontSize: 20, color: '#3a3a3a', align: 'center', fontFamily: 'Cormorant Garamond, serif', italic: true, letterSpacing: 2 },
    ],
  },
  { id: 'mem-life-and-legacy', name: 'Life & Legacy', category: 'Memorial', cells: [
    { x: 0.05, y: 0.08, w: 0.42, h: 0.84, hint: '45' },
    { x: 0.53, y: 0.08, w: 0.42, h: 0.40, hint: '169' },
    { x: 0.53, y: 0.52, w: 0.42, h: 0.40, hint: '169' },
  ]},
  { id: 'mem-verse-page', name: 'Verse & Portrait', category: 'Memorial',
    bgColor: '#f7f4ec',
    cells: [
      { x: 0.55, y: 0.10, w: 0.40, h: 0.80, hint: '45' },
    ],
    captions: [
      { x: 0.05, y: 0.28, w: 0.44, text: '"He gives his beloved sleep."', fontSize: 22, color: '#5a5040', align: 'center', fontFamily: 'Cormorant Garamond, serif', italic: true, letterSpacing: 1 },
      { x: 0.05, y: 0.44, w: 0.44, text: '— Psalm 127:2', fontSize: 14, color: '#8a7a60', align: 'center', fontFamily: 'Cormorant Garamond, serif' },
    ],
  },
  { id: 'mem-family-collage', name: 'Family Remembers', category: 'Memorial', cells: [
    { x: 0.02, y: 0.05, w: 0.32, h: 0.42, hint: '45' },
    { x: 0.36, y: 0.05, w: 0.30, h: 0.42, hint: '169' },
    { x: 0.68, y: 0.05, w: 0.30, h: 0.42, hint: '45' },
    { x: 0.02, y: 0.51, w: 0.30, h: 0.44, hint: '169' },
    { x: 0.34, y: 0.51, w: 0.32, h: 0.44, hint: '45' },
    { x: 0.68, y: 0.51, w: 0.30, h: 0.44, hint: '169' },
  ]},
  { id: 'mem-order-of-service', name: 'Order of Service', category: 'Memorial',
    bgColor: '#f7f4ec',
    cells: [
      { x: 0.35, y: 0.06, w: 0.30, h: 0.44, hint: '45' },
    ],
    captions: [
      { x: 0.10, y: 0.54, w: 0.80, text: 'ORDER OF SERVICE', fontSize: 24, color: '#3a3a3a', align: 'center', fontFamily: 'Cormorant Garamond, serif', bold: true, letterSpacing: 4 },
      { x: 0.15, y: 0.62, w: 0.70, text: 'Opening Hymn\\nWords of Welcome\\nScripture Reading\\nTribute from the Family\\nSermon\\nCommittal\\nClosing Hymn', fontSize: 13, color: '#5a5040', align: 'left', fontFamily: 'Cormorant Garamond, serif', lineHeight: 2 },
    ],
  },

  // ──── CHRISTENING / BAPTISM ────────────────────────────────────────
  { id: 'chr-solo-baby', name: 'The Blessing', category: 'Christening', cells: [
    { x: 0.25, y: 0.06, w: 0.50, h: 0.88, hint: '45' },
  ]},
  { id: 'chr-priest-and-family', name: 'Priest + Family', category: 'Christening', cells: [
    { x: 0.02, y: 0.08, w: 0.60, h: 0.84, hint: '169' },
    { x: 0.65, y: 0.08, w: 0.33, h: 0.40, hint: '11' },
    { x: 0.65, y: 0.52, w: 0.33, h: 0.40, hint: '11' },
  ]},
  { id: 'chr-font-and-parents', name: 'At the Font', category: 'Christening', cells: [
    { x: 0.02, y: 0.05, w: 0.48, h: 0.90, hint: '45' },
    { x: 0.52, y: 0.05, w: 0.46, h: 0.90, hint: '45' },
  ]},
];
