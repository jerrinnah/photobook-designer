import { createClient } from '@supabase/supabase-js';

// Frontend Supabase client. Uses the public ANON key (safe to expose).
// All writes go through Postgres RPC functions guarded by SECURITY DEFINER
// and rate-limited by IP — direct table access is denied by RLS.

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // catches magic-link return URL
      },
    })
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

// Sign up — upserts by email, returns the full profile incl. brand.
// Kept for backward compatibility with the existing SignupModal flow.
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
  storeUser(profileToCache(user));
  return user;
}

// ── Magic-link auth ─────────────────────────────────────────────────
// Sends a one-time sign-in link to the user's email. They click it and
// land back on the app already signed in (Supabase Auth handles the JWT).
export async function sendMagicLink(email, pendingPhone = null) {
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Please enter a valid email.');
  }
  // Stash phone locally so we can pass it to ensure_my_user after the
  // user clicks the link and returns.
  if (pendingPhone) {
    try { localStorage.setItem('photobook-pending-phone', pendingPhone); } catch { /* ignore */ }
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: window.location.origin + window.location.pathname },
  });
  if (error) throw new Error(error.message);
}

// Sign out — clears Supabase session + local cache
export async function signOut() {
  try { await supabase?.auth.signOut(); } catch { /* ignore */ }
  clearStoredUser();
  try { localStorage.removeItem('photobook-pending-phone'); } catch { /* ignore */ }
}

// After a magic-link redirect, the auth state-change listener fires
// SIGNED_IN. We then call ensure_my_user to find or create the public.users
// row matching the auth session and cache the profile.
export async function syncProfileAfterAuth() {
  if (!isSupabaseConfigured) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return null;
  let pendingPhone = null;
  try {
    pendingPhone = localStorage.getItem('photobook-pending-phone');
    if (pendingPhone) localStorage.removeItem('photobook-pending-phone');
  } catch { /* ignore */ }
  const { data, error } = await supabase.rpc('ensure_my_user', {
    p_phone: pendingPhone || null,
  });
  if (error) {
    console.error('ensure_my_user failed:', error.message);
    return null;
  }
  const profile = Array.isArray(data) ? data[0] : data;
  if (profile) storeUser(profileToCache(profile));
  return profile;
}

// Subscribes to Supabase auth events. Calls onChange(profile|null)
// whenever the user signs in or out so React UI can react.
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      const profile = await syncProfileAfterAuth();
      callback(profile);
    } else if (event === 'SIGNED_OUT') {
      clearStoredUser();
      callback(null);
    }
  });
  return () => subscription?.unsubscribe();
}

// Refresh the entire profile (tier + brand) — call on app load so admin
// upgrades and any branding changes take effect without re-signin.
// Prefers the auth-aware RPC when a Supabase session exists; falls back
// to the user-id-based RPC for legacy users who haven't migrated to auth yet.
export async function refreshUserTier() {
  if (!isSupabaseConfigured) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) return;
      const fresh = Array.isArray(data) ? data[0] : data;
      if (fresh) storeUser(profileToCache(fresh));
      return;
    }
  } catch { /* fall back to legacy path */ }

  const u = getStoredUser();
  if (!u?.id) return;
  try {
    const { data, error } = await supabase.rpc('get_user_profile', { p_user_id: u.id });
    if (error) return;
    const fresh = Array.isArray(data) ? data[0] : data;
    if (fresh) storeUser(profileToCache(fresh));
  } catch { /* network blip — ignore */ }
}

const profileToCache = (p) => ({
  id: p.id,
  email: p.email,
  phone: p.phone,
  tier: p.tier || 'free',
  brand: {
    name: p.brand_name || null,
    color: p.brand_color || null,
    logoUrl: p.brand_logo_url || null,
    siteUrl: p.brand_site_url || null,
  },
});

// Premium-only — saves brand on the user's row + refreshes local cache.
export async function updateBrand({ name, color, logoUrl, siteUrl }) {
  const u = getStoredUser();
  if (!u?.id) throw new Error('Sign in first.');
  if (u.tier !== 'premium') throw new Error('Premium required to customize branding.');
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');
  const { error } = await supabase.rpc('update_brand', {
    p_user_id: u.id,
    p_name: (name || '').trim() || null,
    p_color: (color || '').trim() || null,
    p_logo_url: (logoUrl || '').trim() || null,
    p_site_url: (siteUrl || '').trim() || null,
  });
  if (error) throw new Error(error.message);
  storeUser({ ...u, brand: { name, color, logoUrl, siteUrl } });
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
