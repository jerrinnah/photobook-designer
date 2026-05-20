// Paystack inline popup integration.
// Opens the Paystack hosted checkout iframe, returns a promise that resolves
// with the transaction reference on success.

import { supabase, isSupabaseConfigured, getStoredUser } from './supabase';
import { getCurrency, getActiveCurrency, formatMoney } from './currency';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;

export const isPaystackConfigured = () =>
  Boolean(PUBLIC_KEY && !PUBLIC_KEY.endsWith('REPLACE_ME') && typeof window.PaystackPop !== 'undefined');

// Look up the price for a plan in the visitor's selected (or detected)
// currency. Each currency has its own per-plan price set in currency.js
// — not auto-converted from NGN, so values reflect local market pricing.
export function priceForPlan(plan, currencyCode) {
  const c = getCurrency(currencyCode || getActiveCurrency());
  return c[plan] || 0;
}

export const formatPrice = (plan, currencyCode) => {
  const code = currencyCode || getActiveCurrency();
  const amount = priceForPlan(plan, code);
  if (!amount) return '';
  return formatMoney(amount, code);
};

// Opens the Paystack popup. `currencyCode` is optional — defaults to
// the visitor's active currency. All 5 currencies in currency.js are
// Paystack-supported (NGN, USD, ZAR, GHS, KES). The merchant must have
// each currency enabled in their Paystack dashboard for this to work.
export function openPaystackCheckout({ email, plan, currencyCode }) {
  return new Promise((resolve, reject) => {
    if (!isPaystackConfigured()) {
      reject(new Error('Paystack is not configured. Set VITE_PAYSTACK_PUBLIC_KEY.'));
      return;
    }
    const code = currencyCode || getActiveCurrency();
    const amount = priceForPlan(plan, code);
    if (!amount) { reject(new Error('Unknown plan.')); return; }
    const reference = `pb_${plan}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const handler = window.PaystackPop.setup({
      key: PUBLIC_KEY,
      email,
      amount: Math.round(amount * 100),
      currency: code,
      ref: reference,
      metadata: {
        plan,
        currency: code,
        custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: `AutoBook ${plan === 'pro' ? 'Pro' : 'Starter'}` },
          { display_name: 'Currency', variable_name: 'currency', value: code },
        ],
      },
      callback: (response) => resolve(response.reference || reference),
      onClose: () => reject(new Error('Payment was cancelled.')),
    });
    handler.openIframe();
  });
}

// After successful payment, calls Supabase to record the payment and
// flip the user's tier to the chosen plan. Returns true on success.
export async function claimPlan(plan, reference) {
  const user = getStoredUser();
  if (!user?.id || !isSupabaseConfigured) {
    throw new Error('Sign in first before upgrading.');
  }
  const currencyCode = getActiveCurrency();
  const { error } = await supabase.rpc('claim_plan', {
    p_user_id: user.id,
    p_plan: plan,
    p_reference: reference,
    p_amount: priceForPlan(plan, currencyCode),
    p_currency: currencyCode,
  });
  if (error) throw new Error(error.message);
  // Update local cache so UI unlocks immediately
  try {
    const patch = { tier: plan };
    if (plan === 'starter') patch.photobookCount = 0; // backend reset
    localStorage.setItem('photobook-user-v1', JSON.stringify({ ...user, ...patch }));
  } catch { /* ignore */ }
  return true;
}

// Backwards-compat alias used by older code paths
export async function claimPremium(reference) {
  return claimPlan('pro', reference);
}

// ── Pay-per-spread (per-book unlock) ────────────────────────────────
// Opens Paystack with a custom amount tied to a specific project. After
// success, unlockProject() records the payment and grants unlimited
// exports of THAT project (other projects still locked).
// `total` is the amount in the active currency (NOT NGN specifically).
// Param name kept as totalNGN for backward compat with existing callers
// — refactor those next if you want cleaner naming.
export function openPerSpreadCheckout({ email, projectId, totalNGN, spreadCount, coverCount, currencyCode }) {
  return new Promise((resolve, reject) => {
    if (!isPaystackConfigured()) {
      reject(new Error('Paystack is not configured. Set VITE_PAYSTACK_PUBLIC_KEY.'));
      return;
    }
    if (!totalNGN || totalNGN <= 0) { reject(new Error('Nothing to charge.')); return; }
    const code = currencyCode || getActiveCurrency();
    const reference = `pb_book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const handler = window.PaystackPop.setup({
      key: PUBLIC_KEY,
      email,
      amount: Math.round(totalNGN * 100),
      currency: code,
      ref: reference,
      metadata: {
        plan: 'per_spread',
        project_id: projectId,
        spread_count: spreadCount,
        cover_count: coverCount,
        currency: code,
        custom_fields: [
          { display_name: 'Plan',     variable_name: 'plan',     value: 'AutoBook Pay-per-spread' },
          { display_name: 'Book ID',  variable_name: 'book',     value: projectId },
          { display_name: 'Spreads',  variable_name: 'spreads',  value: String(spreadCount) },
          { display_name: 'Cover',    variable_name: 'cover',    value: String(coverCount) },
          { display_name: 'Currency', variable_name: 'currency', value: code },
        ],
      },
      callback: (response) => resolve(response.reference || reference),
      onClose: () => reject(new Error('Payment was cancelled.')),
    });
    handler.openIframe();
  });
}

// Record a per-spread payment in the DB, marking the project unlocked.
export async function unlockProject({ projectId, spreadCount, coverCount, totalNGN, reference, currencyCode }) {
  if (!isSupabaseConfigured) throw new Error('Sign-in required to record payment.');
  const code = currencyCode || getActiveCurrency();
  const { error } = await supabase.rpc('unlock_project', {
    p_project_id: projectId,
    p_spread_count: spreadCount,
    p_cover_count: coverCount,
    p_amount: totalNGN,
    p_reference: reference,
    p_currency: code,
  });
  if (error) throw new Error(error.message);
}

export async function isProjectUnlocked(projectId) {
  if (!isSupabaseConfigured || !projectId) return false;
  const { data, error } = await supabase.rpc('is_project_unlocked', { p_project_id: projectId });
  if (error) return false;
  return data === true;
}
