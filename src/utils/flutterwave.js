// Flutterwave inline-checkout integration. Mirrors the paystack.js
// shape so the dispatcher in payments.js can call either gateway with
// the same arguments.
//
// Used ONLY for GBP — Paystack doesn't accept Pounds. Every other
// currency in currency.js continues to route through Paystack.
// Tx references start with `flw_` so they're trivially distinguishable
// from Paystack's `pb_` refs in the payments table.

import { supabase } from './supabase';
import { getCurrency, getActiveCurrency } from './currency';
import { priceForPlan } from './paystack';

const PUBLIC_KEY = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY;

export const isFlutterwaveConfigured = () =>
  Boolean(
    PUBLIC_KEY
    && !PUBLIC_KEY.endsWith('REPLACE_ME')
    && typeof window.FlutterwaveCheckout !== 'undefined'
  );

const SITE_URL = import.meta.env.VITE_SITE_URL || 'https://autobookbynej.online';

// Plan-based checkout (Starter / Pro). Resolves with the transaction
// reference on success, rejects on close / failure.
export async function openFlutterwaveCheckout({ email, plan, currencyCode }) {
  if (!isFlutterwaveConfigured()) {
    throw new Error('Flutterwave is not configured. Set VITE_FLUTTERWAVE_PUBLIC_KEY.');
  }
  const code = currencyCode || getActiveCurrency();
  const baseAmount = priceForPlan(plan, code);
  if (!baseAmount) throw new Error('Unknown plan.');

  // Referral discount — same shape as the Paystack flow so the user's
  // earned discount applies regardless of which gateway opens.
  const reference = `flw_${plan}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  let discountPct = 0;
  try {
    const summary = await supabase.rpc('get_my_referral_summary');
    discountPct = Number(summary?.data?.discount_pct || 0);
  } catch { /* user might not be in DB yet — ignore */ }
  const discountedAmount = Math.max(1, Math.round(baseAmount * (1 - discountPct / 100) * 100) / 100);

  return new Promise((resolve, reject) => {
    window.FlutterwaveCheckout({
      public_key: PUBLIC_KEY,
      tx_ref: reference,
      amount: discountedAmount,
      currency: code,
      payment_options: 'card,banktransfer,applepay,googlepay',
      redirect_url: '', // empty = stay in popup, fire callback
      customer: { email, name: email },
      customizations: {
        title: `AutoBook ${plan === 'pro' ? 'Pro' : 'Starter'}`,
        description: `One-time ${plan === 'pro' ? 'Pro' : 'Starter'} unlock`,
        logo: `${SITE_URL}/favicon.png`,
      },
      meta: {
        plan,
        currency: code,
        base_amount: baseAmount,
        discount_pct: discountPct,
      },
      callback: (response) => {
        const txRef = response?.tx_ref || reference;
        const status = response?.status;
        if (status && status !== 'successful' && status !== 'completed') {
          reject(new Error(`Payment ${status}.`));
          return;
        }
        if (discountPct > 0) {
          try {
            supabase.rpc('redeem_my_referral_discount', { p_payment_ref: txRef })
              .catch((e) => console.info('[Referral] redeem failed (non-fatal):', e?.message));
          } catch { /* ignore */ }
        }
        resolve(txRef);
      },
      onclose: () => reject(new Error('Payment was cancelled.')),
    });
  });
}

// Pay-per-book checkout — same shape as openPerSpreadCheckout in
// paystack.js so the dispatcher can swap implementations transparently.
export function openPerBookFlutterwaveCheckout({ email, projectId, total, spreadCount, coverCount, currencyCode }) {
  return new Promise((resolve, reject) => {
    if (!isFlutterwaveConfigured()) {
      reject(new Error('Flutterwave is not configured. Set VITE_FLUTTERWAVE_PUBLIC_KEY.'));
      return;
    }
    if (!total || total <= 0) { reject(new Error('Nothing to charge.')); return; }
    const code = currencyCode || getActiveCurrency();
    const reference = `flw_book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.FlutterwaveCheckout({
      public_key: PUBLIC_KEY,
      tx_ref: reference,
      amount: Math.round(total * 100) / 100,
      currency: code,
      payment_options: 'card,banktransfer,applepay,googlepay',
      redirect_url: '',
      customer: { email, name: email },
      customizations: {
        title: 'AutoBook Pay-per-book',
        description: `Unlock ${spreadCount} spread${spreadCount === 1 ? '' : 's'}${coverCount ? ' + cover' : ''}`,
        logo: `${SITE_URL}/favicon.png`,
      },
      meta: {
        plan: 'per_spread',
        project_id: projectId,
        spread_count: spreadCount,
        cover_count: coverCount,
        currency: code,
      },
      callback: (response) => {
        const txRef = response?.tx_ref || reference;
        const status = response?.status;
        if (status && status !== 'successful' && status !== 'completed') {
          reject(new Error(`Payment ${status}.`));
          return;
        }
        resolve(txRef);
      },
      onclose: () => reject(new Error('Payment was cancelled.')),
    });
  });
}
