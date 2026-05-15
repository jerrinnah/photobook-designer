import { createClient } from '@supabase/supabase-js';

// Frontend Supabase client. Uses the public ANON key (safe to expose).
// All writes go through Postgres RPC functions guarded by SECURITY DEFINER
// and rate-limited by IP — direct table access is denied by RLS.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

const USER_KEY = 'photobook-user-v1';

export const getStoredUser = () => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

const storeUser = (user) => {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  catch { /* quota exceeded — ignore */ }
};

export const clearStoredUser = () => {
  localStorage.removeItem(USER_KEY);
};

// Sign up — upserts by email, returns { id, email, phone }
export async function signUp({ email, phone }) {
  if (!isSupabaseConfigured) {
    throw new Error('Signup unavailable — Supabase keys not set.');
  }
  const { data, error } = await supabase.rpc('signup_user', {
    p_email: email.trim().toLowerCase(),
    p_phone: phone?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const user = Array.isArray(data) ? data[0] : data;
  storeUser({ id: user.id, email: user.email, phone: user.phone });
  return user;
}

// Track usage event — 'app_use' or 'photobook_export'
export async function trackEvent(type) {
  const user = getStoredUser();
  if (!user || !isSupabaseConfigured) return;
  try {
    await supabase.rpc('track_event', {
      p_user_id: user.id,
      p_event: type,
    });
  } catch { /* tracking failures should never break the app */ }
}

// Throttle app_use to once per browser session per user
export async function trackAppUseOncePerSession() {
  const user = getStoredUser();
  if (!user) return;
  const flag = `tracked-app-use-${user.id}`;
  if (sessionStorage.getItem(flag)) return;
  sessionStorage.setItem(flag, '1');
  await trackEvent('app_use');
}
