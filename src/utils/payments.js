// Processor-agnostic checkout dispatcher.
//
// Each currency in currency.js carries a `processor` field. This module
// reads it and routes to the matching gateway (Paystack for most,
// Flutterwave for GBP). Every call surface — plan upgrade, pay-per-book
// — has one entry point here, so UI code never has to switch on
// gateway names.

import { getCurrency, getActiveCurrency } from './currency';
import {
  openPaystackCheckout, openPerSpreadCheckout,
  isPaystackConfigured,
} from './paystack';
import {
  openFlutterwaveCheckout, openPerBookFlutterwaveCheckout,
  isFlutterwaveConfigured,
} from './flutterwave';

function processorFor(currencyCode) {
  const c = getCurrency(currencyCode || getActiveCurrency());
  return c?.processor || 'paystack';
}

// True iff THE processor that would be used for the currently-active
// currency is fully configured. Used by UI gating like the Upgrade
// button — we want to disable it only when the gateway the user would
// actually hit isn't ready, not when an unrelated gateway is missing.
export function isCheckoutConfiguredFor(currencyCode) {
  const proc = processorFor(currencyCode);
  if (proc === 'flutterwave') return isFlutterwaveConfigured();
  return isPaystackConfigured();
}

export async function openCheckout({ email, plan, currencyCode }) {
  const proc = processorFor(currencyCode);
  if (proc === 'flutterwave') {
    return openFlutterwaveCheckout({ email, plan, currencyCode });
  }
  return openPaystackCheckout({ email, plan, currencyCode });
}

export function openBookCheckout({ email, projectId, total, spreadCount, coverCount, currencyCode }) {
  const proc = processorFor(currencyCode);
  if (proc === 'flutterwave') {
    return openPerBookFlutterwaveCheckout({
      email, projectId, total, spreadCount, coverCount, currencyCode,
    });
  }
  // Paystack's helper still takes the legacy `totalNGN` arg name — the
  // value isn't NGN-specific, it's whatever the active currency is.
  return openPerSpreadCheckout({
    email, projectId, totalNGN: total, spreadCount, coverCount, currencyCode,
  });
}
