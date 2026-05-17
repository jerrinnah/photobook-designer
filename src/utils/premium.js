// Premium gating rules.
// Free starter set covers basic photobook creation. Everything else
// requires a Premium tier on the user's account.

const FREE_COVER_IDS = new Set([
  'cover-arch-romance',     // classic wedding cover
  'cover-minimal-bottom',   // clean modern cover
]);

// Total templates: ~94. With these rules ~70% are premium:
// - Wedding (~19 templates) → premium
// - Event (~4 templates) → premium
// - Cover (~6 templates) → 4 premium, 2 free
// - Editorial (ed-*) → free if ≤ 4 cells, premium if ≥ 5
// - Standard → free if ≤ 4 cells, premium if ≥ 5
// - Print sizes → free
export function isPremiumTemplate(tmpl) {
  if (!tmpl) return false;
  if (tmpl.category === 'Wedding' || tmpl.category === 'Event') return true;
  if (tmpl.category === 'Cover') return !FREE_COVER_IDS.has(tmpl.id);
  if (tmpl.printSize) return false;
  return (tmpl.cells?.length || 0) >= 5;
}

// Premium feature list — displayed in the admin dashboard so the operator
// sees exactly what the gate covers. Changing labels here updates the
// admin UI; toggling actually-free vs paid behavior happens in the rule
// function above.
export const PREMIUM_FEATURES = [
  { key: 'cover-premium',   name: 'Premium cover designs (4 of 6)',
    detail: 'Bold Letterspace, Side Editorial, Grand Script, Date Card' },
  { key: 'wedding-tpl',     name: 'Wedding-category templates',
    detail: 'All 19 wedding-specific layouts' },
  { key: 'event-tpl',       name: 'Event-category templates',
    detail: 'All 4 event mosaic layouts' },
  { key: 'dense-tpl',       name: 'Dense / editorial templates (5+ cells)',
    detail: 'High-density layouts including all editorial wedding patterns' },
];

export const FREE_FEATURES = [
  { key: 'basic-cover',     name: '2 starter cover designs',
    detail: 'Arch Romance + Minimal Bottom' },
  { key: 'basic-tpl',       name: 'Basic templates (1–4 cells)',
    detail: 'Around 30% of layouts including all hero / pair / trio styles' },
  { key: 'print-sizes',     name: 'Print-size templates',
    detail: 'Standard print proportion guides' },
  { key: 'editing',         name: 'Full editing tools',
    detail: 'Pan / zoom / resize cells, captions, fonts, effects, gradients, backgrounds' },
  { key: 'autosave',        name: 'Autosave + project save/load',
    detail: 'Always available' },
  { key: 'export',          name: 'Export at original resolution',
    detail: 'JPG, PDF, all sizes' },
];
