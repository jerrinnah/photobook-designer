// Premium gating with a generous trial.
//
// Trial: full access to every premium feature for the first 5 photobook
// EXPORTS or 30 days, whichever ends first. After that, free-tier locks
// apply — but only ~50% of templates (vs. the older 70%), so the user
// retains a meaningful free experience.

export const TRIAL_EXPORTS = 5;
export const TRIAL_DAYS = 30;

const FREE_COVER_IDS = new Set([
  'cover-arch-romance',
  'cover-minimal-bottom',
]);

// Returns 'premium' | 'trial' | 'free'.
// Trial is only meaningful for tier='free' users — paid premium users
// always get 'premium'.
export function getEffectiveTier(user) {
  if (!user) return 'free';
  if (user.tier === 'premium') return 'premium';
  const exportsUsed = user.photobookCount ?? 0;
  const createdMs = user.createdAt ? new Date(user.createdAt).getTime() : Date.now();
  const daysSince = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  const inTrial = exportsUsed < TRIAL_EXPORTS && daysSince < TRIAL_DAYS;
  return inTrial ? 'trial' : 'free';
}

// What the user sees in the trial countdown badge.
export function trialStatus(user) {
  if (!user || user.tier === 'premium') return null;
  const exportsUsed = user.photobookCount ?? 0;
  const createdMs = user.createdAt ? new Date(user.createdAt).getTime() : Date.now();
  const daysSince = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  const exportsLeft = Math.max(0, TRIAL_EXPORTS - exportsUsed);
  const daysLeft = Math.max(0, TRIAL_DAYS - daysSince);
  const isActive = exportsLeft > 0 && daysLeft > 0;
  return {
    isActive,
    exportsLeft,
    daysLeft: Math.ceil(daysLeft),
  };
}

// Tier-aware premium check. Returns true if the template is restricted
// for the given effective tier.
//
// premium / trial → nothing locked (full access)
// free (post-trial) → ~50% locked:
//   · Wedding category still premium
//   · Cover-premium templates still premium (4 of 6)
//   · Event category becomes free
//   · Standard becomes free up to 9 cells (was 4)
export function isPremiumTemplate(tmpl, effectiveTier = 'free') {
  if (!tmpl) return false;
  if (effectiveTier === 'premium' || effectiveTier === 'trial') return false;
  if (tmpl.category === 'Wedding') return true;
  if (tmpl.category === 'Cover') return !FREE_COVER_IDS.has(tmpl.id);
  if (tmpl.printSize) return false;
  if (tmpl.category === 'Event') return false;
  return (tmpl.cells?.length || 0) >= 10;
}

// Premium feature list — displayed in the admin dashboard so the operator
// sees exactly what the gate covers. Changing labels here updates the
// admin UI; toggling actually-free vs paid behavior happens in the rule
// function above.
export const PREMIUM_FEATURES = [
  { key: 'trial',           name: `${TRIAL_EXPORTS} free exports + ${TRIAL_DAYS} days full access`,
    detail: 'New accounts get every Premium feature unlocked for the first 5 photobook exports OR 30 days, whichever ends first.' },
  { key: 'no-watermark',    name: 'Exports without watermark',
    detail: 'Free exports carry an "AutoBook by NEJ" diagonal watermark + corner badge' },
  { key: 'proofing',        name: 'Client proofing portal',
    detail: 'Generate a read-only share link clients open in their browser. They approve or request changes — status reports back to you.' },
  { key: 'branding',        name: 'White-label branding',
    detail: 'Replace the AutoBook logo + PDF spec sheet with your own brand name, color, and logo' },
  { key: 'cover-premium',   name: 'Premium cover designs (4 of 6)',
    detail: 'Bold Letterspace, Side Editorial, Grand Script, Date Card' },
  { key: 'wedding-tpl',     name: 'Wedding-category templates',
    detail: 'All 19 wedding-specific layouts' },
  { key: 'dense-tpl',       name: 'Dense editorial templates (10+ cells)',
    detail: 'High-density mosaic layouts for large families and event books' },
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
