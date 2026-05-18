// Paystack inline popup integration.
// Opens the Paystack hosted checkout iframe, returns a promise that resolves
// with the transaction reference on success.

import { supabase, isSupabaseConfigured, getStoredUser } from './supabase';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
const CURRENCY = import.meta.env.VITE_PAYSTACK_CURRENCY || 'NGN';

export const PLAN_PRICES = {
  starter: Number(import.meta.env.VITE_STARTER_PRICE || 5000),
  pro:     Number(import.meta.env.VITE_PRO_PRICE     || 30000),
};

const CURRENCY_SYMBOLS = { NGN: '₦', USD: '$', GHS: '₵', ZAR: 'R', KES: 'KSh' };

export const isPaystackConfigured = () =>
  Boolean(PUBLIC_KEY && !PUBLIC_KEY.endsWith('REPLACE_ME') && typeof window.PaystackPop !== 'undefined');

export const formatPrice = (plan) => {
  const amount = PLAN_PRICES[plan];
  if (!amount) return '';
  const symbol = CURRENCY_SYMBOLS[CURRENCY] || '';
  return `${symbol}${amount.toLocaleString()}`;
};

// Opens the Paystack popup for a specific plan. Resolves with the
// reference on success, rejects if user closes or payment fails.
export function openPaystackCheckout({ email, plan }) {
  return new Promise((resolve, reject) => {
    if (!isPaystackConfigured()) {
      reject(new Error('Paystack is not configured. Set VITE_PAYSTACK_PUBLIC_KEY.'));
      return;
    }
    const amount = PLAN_PRICES[plan];
    if (!amount) { reject(new Error('Unknown plan.')); return; }
    const reference = `pb_${plan}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const handler = window.PaystackPop.setup({
      key: PUBLIC_KEY,
      email,
      amount: Math.round(amount * 100),
      currency: CURRENCY,
      ref: reference,
      metadata: {
        plan,
        custom_fields: [
          { display_name: 'Plan', variable_name: 'plan', value: `AutoBook ${plan === 'pro' ? 'Pro' : 'Starter'}` },
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
  const { error } = await supabase.rpc('claim_plan', {
    p_user_id: user.id,
    p_plan: plan,
    p_reference: reference,
    p_amount: PLAN_PRICES[plan],
    p_currency: CURRENCY,
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
