import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

// Frontend Supabase client. Uses the public ANON key (safe to expose).
// All writes go through Postgres RPC functions guarded by SECURITY DEFINER
// and rate-limited by IP — direct table access is denied by RLS.

// Version marker so support can tell whether a user has the latest
// bundle. Log it once on module load — admins can ask users to open
// DevTools → Console → search for [AutoBook auth] to see what's
// running in their browser.
const AUTH_BUNDLE_VERSION = '2026-05-25-direct-fetch';
if (typeof window !== 'undefined') {
  console.info(`[AutoBook auth] bundle ${AUTH_BUNDLE_VERSION} loaded`);
}

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);
// Re-exported so callers can hit the REST/RPC endpoint directly via
// fetch when the SDK's internal HTTP layer wedges (we've seen 30s
// hangs even when the DB returns the same RPC in <1ms — direct
// fetch with AbortController bypasses whatever the SDK is stuck on).
export const supabaseUrl = url || '';
export const supabaseAnonKey = anonKey || '';

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

// Pub/sub for cache changes — every useAuthUser() hook subscribes here so
// when refreshUserTier (or any other code path) writes a fresh profile to
// localStorage, all UI components re-render with the latest tier without
// needing a page reload.
const cacheListeners = new Set();
const notifyCacheListeners = () => {
  const u = getStoredUser();
  cacheListeners.forEach((fn) => { try { fn(u); } catch { /* ignore */ } });
};

const storeUser = (user) => {
  try { localStorage.setItem(USER_KEY, JSON.stringify(user)); }
  catch { /* quota exceeded — ignore */ }
  notifyCacheListeners();
};

export const clearStoredUser = () => {
  localStorage.removeItem(USER_KEY);
  notifyCacheListeners();
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
  // Force the magic link to return to the public site URL — without this
  // Supabase uses whatever origin the request came from, so a user signing
  // in from localhost gets a magic link that returns to localhost.
  // Include ?app=1 in the redirect so they land on the editor, not the
  // marketing page, when they click the link.
  const baseUrl = import.meta.env.VITE_SITE_URL || (window.location.origin + window.location.pathname);
  const siteUrl = baseUrl.includes('?') ? baseUrl : `${baseUrl}?app=1`;
  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: { emailRedirectTo: siteUrl },
  });
  if (error) throw new Error(error.message);
  // Remember that this visitor has engaged with the auth flow — they
  // should skip the marketing landing on future visits regardless of
  // whether they clicked the link.
  try { localStorage.setItem('photobook-engaged-v1', '1'); } catch { /* ignore */ }
  // 30s grace period so the liveness check doesn't race a freshly
  // hydrating session and false-positive the user out.
  markSessionFresh();
}

// Has this visitor ever started the auth flow OR successfully signed in?
// Used by App.jsx to decide whether to show the marketing landing page
// at "/" — engaged users go straight to the editor.
export function hasEngaged() {
  if (getStoredUser()) return true;
  try { return localStorage.getItem('photobook-engaged-v1') === '1'; }
  catch { return false; }
}

// Sign out — clears Supabase session + local cache, then reloads so no
// component anywhere can hang on to stale in-memory auth state. The
// reload is intentional: it's the simplest guarantee that sign-out is
// always a clean break, regardless of which component subscribed where.
//
// CRITICAL: this function must NEVER hang. supabase.auth.signOut() can
// wedge at the SDK fetch layer (we've seen 30s+ hangs on the same
// project); local-storage cleanup + reload must still happen.
export async function signOut() {
  console.info('[signOut] starting');

  // Flush any pending project autosave to IDB BEFORE we reload — so a
  // signed-in user who just made an edit doesn't lose it on the way out.
  // Lazy import to avoid a circular dep (autosave doesn't depend on auth).
  // Capped at 1s so a hung autosave doesn't block sign-out.
  try {
    await Promise.race([
      import('../store/autosave').then(({ flushAutosave }) => flushAutosave()),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  } catch { /* ignore — never block sign-out on autosave errors */ }

  // Fire the Supabase signOut but DON'T await its full network round-trip
  // beyond 2 seconds. The local-side cleanup below is what actually logs
  // the user out in the browser; the network call is a courtesy to revoke
  // the refresh token server-side.
  try {
    await Promise.race([
      supabase?.auth.signOut() ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(() => {
        console.warn('[signOut] supabase.auth.signOut() did not respond in 2s — proceeding with local cleanup anyway');
        resolve();
      }, 2000)),
    ]);
  } catch (e) {
    console.warn('[signOut] supabase.auth.signOut threw, ignoring:', e?.message);
  }

  // Belt-and-braces: manually purge any Supabase auth keys in case
  // signOut() didn't fully clean up (network errors, stale tokens, etc.)
  try {
    const allKeys = Object.keys(localStorage);
    for (const k of allKeys) {
      if (k.startsWith('sb-') && (k.endsWith('-auth-token') || k.endsWith('-auth-token-code-verifier'))) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }

  clearStoredUser();
  try { localStorage.removeItem('photobook-pending-phone'); } catch { /* ignore */ }
  // Clear the "engaged" flag so they see the marketing landing on next
  // visit (e.g. shared computer, deliberate fresh start).
  try { localStorage.removeItem('photobook-engaged-v1'); } catch { /* ignore */ }

  console.info('[signOut] local cleanup done, reloading');
  // Hard reload to clear every React tree's cached auth state. Use a
  // synchronous redirect (not setTimeout) so even if the browser is
  // throttling timers we get out cleanly.
  window.location.assign(window.location.pathname);
}

// ── Direct RPC bypass ──────────────────────────────────────────────
// supabase-js's internal fetch layer wedges on this project — calls
// to supabase.rpc() / supabase.auth.signOut() can hang indefinitely
// even when the underlying DB returns in <1ms. This helper goes
// straight to PostgREST with native fetch + AbortController so any
// call has a hard cap and a visible Network entry in DevTools.
//
// Returns the parsed JSON response on success (or throws with the
// HTTP status + body excerpt on failure). Throws a clean
// "${label} timed out" error on AbortError so callers can show
// something meaningful instead of an opaque promise hang.
export async function rpcDirect(fnName, params = {}, opts = {}) {
  if (!isSupabaseConfigured) throw new Error('Supabase URL/key not configured.');
  const label = opts.label || fnName;
  const timeoutMs = opts.timeoutMs || 20_000;
  const endpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fnName}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const startedAt = performance.now();
  console.info(`[rpcDirect] → ${fnName}`);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(params),
    });
    const elapsed = Math.round(performance.now() - startedAt);
    const text = await res.text();
    console.info(`[rpcDirect] ← ${fnName} ${res.status} in ${elapsed}ms`);
    if (!res.ok) {
      // Try to extract Supabase's error message; fall back to raw body.
      let detail = text;
      try { const j = JSON.parse(text); detail = j.message || j.error || text; } catch { /* keep raw */ }
      throw new Error(`${label}: ${res.status} ${res.statusText} — ${String(detail).slice(0, 200)}`);
    }
    try { return JSON.parse(text); }
    catch { throw new Error(`${label} returned non-JSON: ${text.slice(0, 200)}`); }
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`${label} timed out after ${timeoutMs / 1000}s. Check the Network tab in DevTools — the ${fnName} request will show why (CORS, paused project, network drop).`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ── Liveness check: detect server-side account deletion ────────────
// Supabase JWTs are valid until expiry (default 1h) regardless of
// whether the auth.users row still exists. If an admin deletes a
// signed-in user, their tab keeps working until the access token
// expires. This helper round-trips to Supabase to verify the session
// is still real — call it on tab focus / visibilitychange / a slow
// polling interval to force-sign-out deleted users within seconds
// of them coming back to the app.
//
// CRITICAL: be conservative. False positives sign legitimate users
// out — much worse than letting a deleted user keep their tab open
// for an extra minute. Only sign out when we're CERTAIN the user
// row is gone (HTTP 404 / "user from sub claim in JWT does not
// exist" / explicit "user_not_found"). Generic "session" / "jwt"
// errors are NOT enough — those happen during normal token refresh.
function isUserDeletedError(error) {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  // Supabase Auth returns one of these on a deleted user:
  //   "User from sub claim in JWT does not exist"
  //   "user_not_found"
  // HTTP 404 from the user-info endpoint is also a strong signal.
  return msg.includes('user from sub claim') ||
         msg.includes('user_not_found') ||
         msg.includes('user not found') ||
         error.status === 404;
}

async function isSessionStillValid() {
  if (!isSupabaseConfigured) return true;
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) {
      if (isUserDeletedError(error)) {
        console.warn('[auth] user-deleted signal from server:', error.message);
        return false;
      }
      // Any other error (network, 503, session refresh race, etc.) →
      // assume valid. We do NOT sign the user out for transient issues.
      return true;
    }
    // getUser() returned no error AND no user → user is gone.
    if (!user?.id) {
      console.warn('[auth] getUser returned no user — treating as deleted.');
      return false;
    }
    return true;
  } catch (e) {
    // Network failure (fetch threw) — assume valid; don't kick users offline.
    console.info('[auth] liveness check network error, assuming valid:', e?.message);
    return true;
  }
}

let _livenessStopFns = [];
// Used to give the user a grace period after sign-in — if a getUser
// call races with session propagation, we don't want to log them out.
let _sessionGraceUntil = 0;
export function markSessionFresh(ms = 30_000) {
  _sessionGraceUntil = Date.now() + ms;
}

export function startSessionLivenessCheck() {
  if (typeof window === 'undefined') return () => {};
  // Avoid stacking listeners across re-renders / HMR.
  stopSessionLivenessCheck();

  const verifyAndKickIfGone = async () => {
    if (!getStoredUser()) return; // not signed in — nothing to verify
    if (Date.now() < _sessionGraceUntil) return; // just signed in — skip
    const ok = await isSessionStillValid();
    if (!ok) {
      console.warn('[auth] session no longer valid — server-side account was deleted or revoked. Signing out.');
      try { await signOut(); } catch { /* signOut already reloads on success */ }
    }
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') verifyAndKickIfGone();
  };
  const onFocus = () => verifyAndKickIfGone();
  // Slow poll as a backstop — every 5 minutes — so even a user who
  // never tabs away gets caught.
  const interval = setInterval(verifyAndKickIfGone, 5 * 60 * 1000);

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onFocus);
  _livenessStopFns.push(
    () => document.removeEventListener('visibilitychange', onVisible),
    () => window.removeEventListener('focus', onFocus),
    () => clearInterval(interval),
  );
  // Don't fire immediately on mount — give the page time to hydrate
  // any pending magic-link / password-signup session first. Skip if
  // we're inside the post-signin grace window.
  setTimeout(verifyAndKickIfGone, 5_000);
  return stopSessionLivenessCheck;
}
export function stopSessionLivenessCheck() {
  for (const fn of _livenessStopFns) try { fn(); } catch { /* ignore */ }
  _livenessStopFns = [];
}

// ── Password auth (optional, for returning users) ───────────────────
// Users always start with magic link (Supabase Auth verifies the email
// that way). After their first sign-in they can optionally set a
// password from the profile menu — subsequent sign-ins can then use
// either method.

// One-shot signup with email + password. The BEFORE INSERT trigger in
// SUPABASE_DEFAULT_PASSWORD.sql auto-confirms the email when a password
// is present, so the user is signed in immediately and can proceed to
// pay without an inbox round-trip. Optional phone is mirrored into the
// public.users row via the signup_user RPC (best-effort).
export async function signUpWithPassword(email, password, phone) {
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');
  const trimmed = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Please enter a valid email.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: trimmed,
    password,
    options: phone ? { data: { phone } } : undefined,
  });
  if (signUpErr) {
    if (/already registered|already exists|user.*exists/i.test(signUpErr.message)) {
      throw new Error('An account already exists for this email. Use Sign in instead.');
    }
    throw new Error(signUpErr.message);
  }
  // Best-effort: mirror phone into public.users (and ensure row exists).
  if (phone) {
    try { await signUp({ email: trimmed, phone }); } catch { /* non-fatal */ }
  }

  // If supabase.auth.signUp returned a session, the user is signed in
  // immediately — no further work needed.
  if (signUpData?.session?.access_token) {
    try { localStorage.setItem('photobook-engaged-v1', '1'); } catch { /* ignore */ }
    markSessionFresh();
    return;
  }

  // No session returned → Supabase requires email confirmation. Try
  // an explicit sign-in (in case the auto-confirm trigger fired). If
  // that fails, the user is stuck pending confirmation — surface a
  // clear message and direct them to their inbox instead of letting
  // them think the password is wrong.
  try {
    const { error: siErr } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (siErr) throw siErr;
    try { localStorage.setItem('photobook-engaged-v1', '1'); } catch { /* ignore */ }
    markSessionFresh();
  } catch (e) {
    console.error('[signUpWithPassword] account created but immediate sign-in failed', e);
    throw new Error(
      "Your account was created but Supabase requires email confirmation before you can sign in. " +
      "Check your inbox for the confirmation link, then come back and sign in. " +
      "(Admins: disable 'Confirm email' in Supabase Auth → Providers → Email to skip this step.)"
    );
  }
}

export async function signInWithPassword(email, password) {
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');
  const trimmed = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('Please enter a valid email.');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  // Direct POST to /auth/v1/token bypasses the supabase-js HTTP layer
  // which has been wedging on some users' browsers — the SDK promise
  // never resolves so the button stays stuck on "Signing in...".
  // AbortController gives us a real hard cap on the request.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res, raw;
  try {
    res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        apikey: supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: trimmed, password }),
    });
    raw = await res.text();
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('Sign-in timed out after 15s. If this keeps happening, disable browser extensions (we saw runtime.lastError in your console — an extension is intercepting requests) or try an incognito window.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = JSON.parse(raw); } catch { /* keep raw */ }

  if (!res.ok) {
    const msg = (data?.error_description || data?.message || data?.error || raw || '').toString();
    console.error('[signInWithPassword] non-2xx response', res.status, msg);
    if (/invalid login|invalid credentials|invalid_grant|invalid email or password/i.test(msg)) {
      throw new Error("Sign-in failed. Either the password is wrong OR your email hasn't been confirmed yet — check your inbox for the confirmation link, or use 'Forgot password? Email me a link' below.");
    }
    if (/email.*not.*confirmed/i.test(msg)) {
      throw new Error("Your email isn't confirmed yet. Check your inbox for the confirmation link, or use 'Forgot password? Email me a link' below to get a fresh one.");
    }
    throw new Error(msg || `Sign-in failed: HTTP ${res.status}`);
  }

  // Hydrate the SDK session so onAuthStateChange fires + the rest of
  // the app (autosave, profile menu, paywalls) sees the user.
  // Capped at 5s — setSession can itself wedge on the same SDK issue.
  // If it does, we fall back to writing the auth token directly to
  // localStorage so the next page load picks up the session.
  if (data?.access_token && data?.refresh_token) {
    try {
      await Promise.race([
        supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        }),
        new Promise((_, reject) => setTimeout(
          () => reject(new Error('setSession timed out (5s)')),
          5_000,
        )),
      ]);
    } catch (e) {
      console.warn('[signInWithPassword] setSession failed; writing token directly to localStorage as fallback', e);
      try {
        // Match the SDK's localStorage key format. Project ref is the
        // first subdomain of the Supabase URL (e.g. xyzabc.supabase.co
        // → key prefix sb-xyzabc).
        const projectRef = (supabaseUrl.match(/https?:\/\/([^.]+)\./) || [])[1] || 'project';
        const key = `sb-${projectRef}-auth-token`;
        const payload = {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_type: 'bearer',
          expires_in: data.expires_in || 3600,
          expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
          user: data.user,
        };
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (innerErr) {
        console.error('[signInWithPassword] localStorage fallback also failed', innerErr);
      }
    }
  }

  try { localStorage.setItem('photobook-engaged-v1', '1'); } catch { /* ignore */ }
  // 30s grace period so the liveness check doesn't race a freshly
  // hydrating session and false-positive the user out.
  markSessionFresh();
}

// Sets (or changes) the current user's password. Requires an active
// session (they had to magic-link in first). After this, the same email
// can sign in via password OR magic link.
//
// Wrapped in a 15s timeout so a stalled network / unresponsive GoTrue
// surfaces as a clear error instead of an infinite spinner.
export async function setMyPassword(newPassword) {
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');
  if (!newPassword || newPassword.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('Sign in first via magic link, then set a password.');

  const updatePromise = supabase.auth.updateUser({ password: newPassword });
  const timeoutPromise = new Promise((_, reject) => setTimeout(
    () => reject(new Error("Password update timed out (15s). Check your network or try signing out and back in via magic link.")),
    15_000,
  ));

  const result = await Promise.race([updatePromise, timeoutPromise]);
  if (result?.error) {
    // Log full error to console for debugging; show clean message to user.
    console.error('[setMyPassword] Supabase error', result.error);
    throw new Error(result.error.message || 'Supabase rejected the password change.');
  }
}

// After a magic-link redirect, the auth state-change listener fires
// SIGNED_IN. We then call ensure_my_user to find or create the public.users
// row matching the auth session and cache the profile.
//
// If the RPC fails (network blip, function not yet deployed, etc.), we
// still return a minimal "session-only" profile derived from the JWT so
// the UI can flip out of signed-out state. The cache stores this fallback
// flagged with `_fromSession: true` so other code paths can re-sync later.
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
    console.error('ensure_my_user failed — using session-only profile:', error.message);
    const fallback = sessionFallbackProfile(session);
    storeUser(fallback);
    return fallback;
  }
  const profile = Array.isArray(data) ? data[0] : data;
  if (profile) {
    storeUser(profileToCache(profile));
    return profileToCache(profile);
  }
  // RPC returned no row (shouldn't happen, but be defensive)
  const fallback = sessionFallbackProfile(session);
  storeUser(fallback);
  return fallback;
}

// Minimal profile shape we can build from just the Supabase auth session.
// Used as a fallback when ensure_my_user can't return a public.users row.
// Marked _fromSession so refreshUserTier can try to upgrade it later.
function sessionFallbackProfile(session) {
  const cached = getStoredUser();
  return {
    id: cached?.id || session.user.id,
    email: session.user.email,
    phone: cached?.phone || null,
    tier: cached?.tier || 'free',
    photobookCount: cached?.photobookCount ?? 0,
    createdAt: cached?.createdAt || session.user.created_at || null,
    brand: cached?.brand || { name: null, color: null, logoUrl: null, siteUrl: null },
    _fromSession: true,
  };
}

// Subscribes to Supabase auth events. Calls onChange(profile|null)
// whenever the user signs in or out so React UI can react.
//
// Important: this listener is conservative about signing the user out.
// It only emits `null` on an explicit SIGNED_OUT. Network blips, missing
// sessions, or RPC failures fall back to the locally cached profile so
// a refresh never randomly logs the user out.
export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured) {
    queueMicrotask(() => callback(getStoredUser()));
    return () => {};
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      clearStoredUser();
      callback(null);
      return;
    }
    // INITIAL_SESSION fires on every page load. If there is no Supabase
    // session at all, surface whatever we have cached (handles legacy users
    // who signed up before magic-link auth was enabled).
    if (event === 'INITIAL_SESSION' && !session) {
      callback(getStoredUser());
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
      // 30s liveness-check grace so the session-validity probe doesn't
      // race the freshly hydrated token and false-positive a sign-out.
      markSessionFresh();
      const profile = await syncProfileAfterAuth();
      // If sync failed (network, RPC blip), keep the cached profile —
      // DO NOT pass null and accidentally sign the user out.
      const final = profile || getStoredUser();
      if (final?.email) {
        const fromSession = final._fromSession ? ' (session-only — DB sync failed, retrying)' : '';
        console.info(`[Auth] Signed in as ${final.email} — tier: ${final.tier || 'free'}${fromSession}`);
      }
      callback(final);
      // Defensive second-chance refresh: if the session-only fallback was
      // used (or even if not), confirm the tier from the DB after a moment.
      // This catches the case where ensure_my_user failed transiently and
      // the user is actually on a paid tier.
      if (event === 'SIGNED_IN' || final?._fromSession) {
        setTimeout(() => refreshUserTier(), 1500);
      }
    }
  });
  return () => subscription?.unsubscribe();
}

// Refresh the entire profile (tier + brand) — call on app load so admin
// upgrades and any branding changes take effect without re-signin.
// Prefers the auth-aware RPC when a Supabase session exists; falls back
// to the user-id-based RPC for legacy users who haven't migrated to auth yet.
//
// Writing to localStorage triggers cacheListeners, so every useAuthUser()
// hook re-renders with the latest tier — locked templates unlock as soon
// as the paid tier is confirmed.
export async function refreshUserTier() {
  if (!isSupabaseConfigured) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const { data, error } = await supabase.rpc('get_my_profile');
      if (error) { console.warn('[Auth] get_my_profile failed:', error.message); return; }
      const fresh = Array.isArray(data) ? data[0] : data;
      if (fresh) {
        const cached = profileToCache(fresh);
        storeUser(cached);
        console.info(`[Auth] Tier refreshed for ${cached.email} → ${cached.tier}`);
      }
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
  photobookCount: p.photobook_count ?? 0,
  createdAt: p.created_at || null,
  brand: {
    name: p.brand_name || null,
    color: p.brand_color || null,
    logoUrl: p.brand_logo_url || null,
    siteUrl: p.brand_site_url || null,
  },
});

// Premium / trial only — saves brand on the user's row + refreshes local cache.
export async function updateBrand({ name, color, logoUrl, siteUrl }) {
  const u = getStoredUser();
  if (!u?.id) throw new Error('Sign in first.');
  // Lazy import to avoid a circular dep
  const { getEffectiveTier } = await import('./premium');
  if (getEffectiveTier(u) === 'free') throw new Error('Premium or active trial required to customize branding.');
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

// ── useAuthUser — reactive hook shared by every UI component that needs
//                 to know whether the visitor is signed in. Subscribes
//                 to BOTH Supabase auth events (sign-in/sign-out) and
//                 cache writes (refreshUserTier, claimPlan upgrade) so
//                 every UI piece reflects the latest tier without a
//                 page reload.
export function useAuthUser() {
  const [user, setUser] = useState(() => getStoredUser());
  useEffect(() => {
    const unsubAuth = onAuthStateChange((profile) => setUser(profile || null));
    cacheListeners.add(setUser);
    return () => {
      unsubAuth();
      cacheListeners.delete(setUser);
    };
  }, []);
  return user;
}
