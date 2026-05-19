// Premium gating with two paid plans + a generous trial.
//
// Plans:
//   free    — no payment. Trial users land here after their trial ends.
//   starter — ₦5,000 one-time. Up to 10 photobook exports. Access to
//             every template EXCEPT Pro-only ones (Wedding, Event, premium
//             covers — the "new templates and covers" pack).
//   pro     — ₦30,000 one-time. Unlimited exports + every template.
//
// Trial: first 5 exports OR 30 days, whichever ends first. During the
// trial, every Pro feature is unlocked.

export const TRIAL_EXPORTS = 5;
export const TRIAL_DAYS = 30;
export const STARTER_QUOTA = 10;

// Pay-per-book pricing — third option alongside Starter / Pro.
// Each designed regular spread is ₦750, a designed cover is ₦1,000.
// One payment unlocks that specific project for unlimited exports.
// If the user later designs more spreads, they top up with another
// payment that covers just the new ones.
export const SPREAD_PRICE = 750;
export const COVER_PRICE  = 1000;

// A spread is "designed" iff at least one of its cells holds a photo.
// Empty/skipped spreads don't count toward the price — pay for what
// you finish, not for placeholders.
export function isSpreadDesigned(spread) {
  if (!spread?.cells || !Array.isArray(spread.cells)) return false;
  return spread.cells.some((c) => c?.photoId != null);
}

// Calculate what this book would cost on pay-per-spread.
// Returns { totalNGN, spreadCount, coverCount, totalSpreadsInBook }.
// Only DESIGNED spreads contribute to the price.
export function priceForProject(spreads) {
  const list = spreads || [];
  const designed = list.filter(isSpreadDesigned);
  const coverCount  = designed.filter((s) => s?.role === 'cover').length;
  const spreadCount = Math.max(0, designed.length - coverCount);
  return {
    totalNGN: spreadCount * SPREAD_PRICE + coverCount * COVER_PRICE,
    spreadCount,
    coverCount,
    totalSpreadsInBook: list.length,   // for "x of N spreads designed" messaging
  };
}

const FREE_COVER_IDS = new Set([
  'cover-arch-romance',
  'cover-minimal-bottom',
]);

// Pro-only template categories — the "new templates and covers" the user
// wants to gate behind the Pro plan.
function isProOnlyTemplate(tmpl) {
  if (!tmpl) return false;
  if (tmpl.category === 'Wedding') return true;
  if (tmpl.category === 'Event') return true;
  if (tmpl.category === 'Cover' && !FREE_COVER_IDS.has(tmpl.id)) return true;
  return false;
}

// Returns 'pro' | 'starter' | 'trial' | 'free'.
// Trial only applies to tier='free' users in their first 5 exports + 30 days.
// Paid tiers (starter, pro) bypass trial.
export function getEffectiveTier(user) {
  if (!user) return 'free';
  if (user.tier === 'pro') return 'pro';
  if (user.tier === 'starter') {
    // Starter is limited to STARTER_QUOTA exports. After that they're
    // effectively free until they upgrade.
    const used = user.photobookCount ?? 0;
    return used < STARTER_QUOTA ? 'starter' : 'free';
  }
  // Tier is 'free' — check trial window
  const exportsUsed = user.photobookCount ?? 0;
  const createdMs = user.createdAt ? new Date(user.createdAt).getTime() : Date.now();
  const daysSince = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
  const inTrial = exportsUsed < TRIAL_EXPORTS && daysSince < TRIAL_DAYS;
  return inTrial ? 'trial' : 'free';
}

// Convenience: has access to Pro-only templates (Wedding/Event/premium covers)
export function hasProAccess(effectiveTier) {
  return effectiveTier === 'pro' || effectiveTier === 'trial';
}

// Convenience: has full Premium feature access (sharing, branding, no watermark)
export function hasPremiumAccess(effectiveTier) {
  return effectiveTier === 'pro' || effectiveTier === 'starter' || effectiveTier === 'trial';
}

// Can the user export the current project? Either a tier with export
// allowance OR they paid for this specific project under pay-per-spread.
// `projectUnlocked` is a boolean the caller computes (via supabase RPC
// or a local cache that mirrors project_unlocks).
export function canExportProject(effectiveTier, projectUnlocked) {
  if (effectiveTier === 'pro' || effectiveTier === 'trial') return true;
  if (effectiveTier === 'starter') return true;      // gated separately by quota
  return Boolean(projectUnlocked);
}

// What the user sees in the trial countdown badge.
export function trialStatus(user) {
  if (!user || user.tier === 'pro' || user.tier === 'starter') return null;
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

// What the user sees for Starter quota remaining.
export function starterStatus(user) {
  if (user?.tier !== 'starter') return null;
  const used = user.photobookCount ?? 0;
  return {
    used,
    quota: STARTER_QUOTA,
    remaining: Math.max(0, STARTER_QUOTA - used),
    isExhausted: used >= STARTER_QUOTA,
  };
}

// Tier-aware lock check. Returns true if the template should show 🔒.
//
// pro / trial → nothing locked
// starter     → only Pro-only templates locked (Wedding, Event, premium covers)
// free        → ~50% locked: Pro-only + dense standard templates
export function isPremiumTemplate(tmpl, effectiveTier = 'free') {
  if (!tmpl) return false;
  if (effectiveTier === 'pro' || effectiveTier === 'trial') return false;
  // Starter: locked iff it's Pro-only content
  if (effectiveTier === 'starter') return isProOnlyTemplate(tmpl);
  // Free / post-trial: Pro-only + dense (≥10 cell) standard templates
  if (isProOnlyTemplate(tmpl)) return true;
  if (tmpl.printSize) return false;
  return (tmpl.cells?.length || 0) >= 10;
}

// Premium feature list — displayed in the admin dashboard so the operator
// sees exactly what the gate covers. Changing labels here updates the
// admin UI; toggling actually-free vs paid behavior happens in the rule
// function above.
export const STARTER_FEATURES = [
  { key: 'starter-exports', name: `${STARTER_QUOTA} photobook exports`,
    detail: `Each PDF/JPG export counts as one. Resets when you upgrade.` },
  { key: 'no-watermark',    name: 'Exports without watermark' },
  { key: 'proofing',        name: 'Client proofing portal',
    detail: 'Share a read-only preview link with clients for approval' },
  { key: 'branding',        name: 'White-label branding' },
  { key: 'editing',         name: 'Full editing tools' },
];

export const PRO_FEATURES = [
  { key: 'unlimited',       name: 'Unlimited photobook exports',
    detail: 'No cap. Export as many books as you want, forever.' },
  { key: 'all-templates',   name: 'All new templates + covers',
    detail: 'Wedding-category templates (19), Event templates (4), and all 6 cover designs — including new releases as they ship.' },
  { key: 'everything-starter', name: 'Everything in Starter',
    detail: 'No-watermark exports, client proofing, white-label branding, full editing tools.' },
];

export const PREMIUM_FEATURES = [...PRO_FEATURES, ...STARTER_FEATURES.slice(1)];

export const FREE_FEATURES = [
  { key: 'trial',           name: `${TRIAL_EXPORTS} free trial exports + ${TRIAL_DAYS} days full access`,
    detail: 'New accounts get every Pro feature unlocked for the first 5 photobook exports OR 30 days, whichever ends first.' },
  { key: 'basic-tpl',       name: 'Basic templates (1–9 cells)',
    detail: 'Around half of all layouts including all hero / pair / trio styles' },
  { key: 'print-sizes',     name: 'Print-size templates' },
  { key: 'editing',         name: 'Full editing tools' },
];

