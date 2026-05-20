// Multi-currency pricing + auto-detection.
//
// All 5 currencies here are Paystack-supported, so the existing payment
// flow works without a second processor. Visitors see prices in their
// local currency by default; they can switch manually via the selector
// on the landing page + upgrade modal.
//
// Prices are set per-currency (not auto-converted from NGN) so they can
// reflect local purchasing-power instead of raw exchange rates.

import { useEffect, useState } from 'react';

// Per-currency pricing tuned to local purchasing power, not raw exchange.
//
// USD is the international anchor — $19 / $59 is intentionally aggressive
// for a one-time-pay SaaS (most photographer tools are $20-90/mo).
//
// NGN is held at the original strategic-discount levels (₦5K / ₦45K) —
// ~$3 / $30 at current exchange — to keep the Nigerian home market
// accessible. This is roughly 70% off USD at exchange rates, intentional.
//
// ZAR / GHS / KES land between those two anchors: priced as "fair for
// the local market" rather than direct USD conversions, but not as
// deeply discounted as NGN. Approx 25-35% off USD at exchange rates.
//
// Tweak any number below freely — these flow straight through to the
// landing page, upgrade modal, and Paystack popup.
export const CURRENCIES = {
  USD: {
    code: 'USD', symbol: '$', label: 'USD',
    starter: 19, pro: 59,
    spread: 1, cover: 1.5,
    flag: '🌎',
  },
  NGN: {
    code: 'NGN', symbol: '₦', label: 'NGN',
    starter: 5000, pro: 45000,
    spread: 750, cover: 1000,
    flag: '🇳🇬',
  },
  ZAR: {
    code: 'ZAR', symbol: 'R', label: 'ZAR',
    starter: 199, pro: 599,
    spread: 12, cover: 19,
    flag: '🇿🇦',
  },
  GHS: {
    code: 'GHS', symbol: '₵', label: 'GHS',
    starter: 99, pro: 299,
    spread: 5, cover: 8,
    flag: '🇬🇭',
  },
  KES: {
    code: 'KES', symbol: 'KSh', label: 'KES',
    starter: 999, pro: 3999,
    spread: 65, cover: 99,
    flag: '🇰🇪',
  },
};

const STORAGE_KEY = 'photobook-currency-v1';

// language tags → currency
const LANG_MAP = {
  'en-NG': 'NGN', 'ig': 'NGN', 'yo': 'NGN', 'ha': 'NGN',
  'en-ZA': 'ZAR', 'af': 'ZAR', 'zu': 'ZAR', 'xh': 'ZAR',
  'en-GH': 'GHS',
  'en-KE': 'KES', 'sw': 'KES', 'sw-KE': 'KES',
};

// IANA timezones → currency (covers users with English-language browsers
// living abroad — e.g. "en-US" reporter actually in Lagos)
const TZ_MAP = {
  'Africa/Lagos': 'NGN',
  'Africa/Johannesburg': 'ZAR',
  'Africa/Accra': 'GHS',
  'Africa/Nairobi': 'KES',
  'Africa/Mombasa': 'KES',
};

function detectCurrency() {
  if (typeof window === 'undefined') return 'USD';

  // 1. Manual override wins
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && CURRENCIES[saved]) return saved;
  } catch { /* ignore */ }

  // 2. Language preference
  try {
    const langs = [
      ...(navigator.languages || []),
      navigator.language,
    ].filter(Boolean);
    for (const l of langs) {
      if (LANG_MAP[l]) return LANG_MAP[l];
    }
  } catch { /* ignore */ }

  // 3. Timezone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ_MAP[tz]) return TZ_MAP[tz];
  } catch { /* ignore */ }

  // 4. Default — international audience
  return 'USD';
}

export function getCurrency(code) {
  return CURRENCIES[code] || CURRENCIES.USD;
}

export function formatMoney(amount, code) {
  const c = getCurrency(code);
  const value = Number(amount) || 0;
  const display = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${c.symbol}${display}`;
}

// React hook — reactive currency state with cross-tab sync.
export function useCurrency() {
  const [code, setCode] = useState(() => detectCurrency());

  // Listen for changes from other tabs / components
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue && CURRENCIES[e.newValue]) {
        setCode(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const set = (newCode) => {
    if (!CURRENCIES[newCode]) return;
    setCode(newCode);
    try { localStorage.setItem(STORAGE_KEY, newCode); } catch { /* ignore */ }
  };

  return {
    code,
    set,
    currency: CURRENCIES[code] || CURRENCIES.USD,
    available: Object.keys(CURRENCIES),
  };
}

// Non-React getter (for places like the Paystack call site that don't
// need reactivity)
export function getActiveCurrency() {
  return detectCurrency();
}
