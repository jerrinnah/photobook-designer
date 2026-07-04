// Print bureau presets — one-click page-size / bleed / DPI settings
// that match specific commercial printers' file-spec requirements.
//
// Each preset maps to an existing SPREAD_SIZES id (or a customSize)
// plus optional overrides for bleed and target DPI. Applying a preset
// updates the active project's page size, gap, and (if we ever add
// per-spread bleed control) the bleed amount.
//
// Sourcing: specs pulled from each bureau's public "file setup" or
// "book specifications" page. Where a bureau supports multiple book
// sizes we list the most common wedding-book choice.

export const PRINT_BUREAUS = [
  {
    id: 'snapfish-12x12',
    label: 'SnapFish 12×12"',
    country: 'US / UK',
    spreadSizeId: 'sq-12',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Standard 12" square wedding book. Full-bleed layouts recommended.',
  },
  {
    id: 'snapfish-8x8',
    label: 'SnapFish 8×8"',
    country: 'US / UK',
    spreadSizeId: 'sq-8',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Everyday square book — great for family gift orders.',
  },
  {
    id: 'blurb-trade-10x8',
    label: 'Blurb Trade 10×8"',
    country: 'Global',
    spreadSizeId: 'ls-11x85',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Blurb Trade book. RGB accepted; they convert on their end.',
  },
  {
    id: 'blurb-large-13x11',
    label: 'Blurb Large Landscape 13×11"',
    country: 'Global',
    spreadSizeId: 'ls-14x11',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Blurb ProLine Pearl / Uncoated. Bleed is required.',
  },
  {
    id: 'photobook-worldwide-10x10',
    label: 'Photobook Worldwide 10×10"',
    country: 'Nigeria / Global',
    spreadSizeId: 'sq-10',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Popular Nigerian printer choice. Wedding standard.',
  },
  {
    id: 'photobook-worldwide-12x8',
    label: 'Photobook Worldwide 12×8" landscape',
    country: 'Nigeria / Global',
    spreadSizeId: 'ls-11x85',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Landscape wedding book.',
  },
  {
    id: 'artifact-uprising-8x8',
    label: 'Artifact Uprising 8×8" Layflat',
    country: 'US',
    spreadSizeId: 'sq-8',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Layflat album — center gutter is safe.',
  },
  {
    id: 'artifact-uprising-11x14',
    label: 'Artifact Uprising 11×14" Layflat',
    country: 'US',
    spreadSizeId: 'pt-11x14',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Premium layflat. Bleed required on covers.',
  },
  {
    id: 'shutterfly-12x12',
    label: 'Shutterfly 12×12"',
    country: 'US',
    spreadSizeId: 'sq-12',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Consumer-grade. RGB in, CMYK conversion on their press.',
  },
  {
    id: 'milk-books-11x14',
    label: 'MILK Books 11×14" landscape',
    country: 'AU / NZ',
    spreadSizeId: 'ls-14x11',
    bleedInches: 0.125,
    dpi: 300,
    colorSpace: 'RGB',
    notes: 'Premium fine-art album. Consistent color across print runs.',
  },
];

export function findBureau(id) {
  return PRINT_BUREAUS.find((b) => b.id === id);
}
