// Paystack inline popup integration.
// Opens the Paystack hosted checkout iframe, returns a promise that resolves
// with the transaction reference on success.

import { supabase, isSupabaseConfigured, getStoredUser } from './supabase';

const PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY;
const AMOUNT_MAJOR = Number(import.meta.env.VITE_PAYSTACK_AMOUNT || 5000);
const CURRENCY = import.meta.env.VITE_PAYSTACK_CURRENCY || 'NGN';

// Minor unit conversion. Paystack expects amounts in kobo for NGN, cents
// for USD, pesewas for GHS — all 1/100 of the major unit.
const amountMinor = () => Math.round(AMOUNT_MAJOR * 100);

export const isPaystackConfigured = () =>
  Boolean(PUBLIC_KEY && !PUBLIC_KEY.endsWith('REPLACE_ME') && typeof window.PaystackPop !== 'undefined');

export const formatPrice = () => {
  const currencySymbols = { NGN: '₦', USD: '$', GHS: '₵', ZAR: 'R', KES: 'KSh' };
  const symbol = currencySymbols[CURRENCY] || '';
  return `${symbol}${AMOUNT_MAJOR.toLocaleString()}`;
};

// Opens the Paystack popup. Resolves with the reference on success,
// rejects if user closes or payment fails.
export function openPaystackCheckout({ email }) {
  return new Promise((resolve, reject) => {
    if (!isPaystackConfigured()) {
      reject(new Error('Paystack is not configured. Set VITE_PAYSTACK_PUBLIC_KEY.'));
      return;
    }
    const reference = `pb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const handler = window.PaystackPop.setup({
      key: PUBLIC_KEY,
      email,
      amount: amountMinor(),
      currency: CURRENCY,
      ref: reference,
      metadata: {
        custom_fields: [
          { display_name: 'Product', variable_name: 'product', value: 'AutoBook Premium' },
        ],
      },
      callback: (response) => {
        resolve(response.reference || reference);
      },
      onClose: () => {
        reject(new Error('Payment was cancelled.'));
      },
    });
    handler.openIframe();
  });
}

// After successful payment, calls Supabase to record the payment and
// upgrade the user. Returns true on success.
export async function claimPremium(reference) {
  const user = getStoredUser();
  if (!user?.id || !isSupabaseConfigured) {
    throw new Error('Sign up first before upgrading.');
  }
  const { error } = await supabase.rpc('claim_premium', {
    p_user_id: user.id,
    p_reference: reference,
    p_amount: AMOUNT_MAJOR,
    p_currency: CURRENCY,
  });
  if (error) throw new Error(error.message);
  // Update local cache so UI unlocks immediately
  try {
    localStorage.setItem(
      'photobook-user-v1',
      JSON.stringify({ ...user, tier: 'premium' })
    );
  } catch { /* ignore */ }
  return true;
}
