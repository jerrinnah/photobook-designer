// Device-limit enforcement.
//
// Each browser/install gets a stable UUID stored in localStorage. After
// every sign-in we call public.claim_device on Supabase, which decides
// whether this device is allowed on the account (see SUPABASE_DEVICES.sql
// for the policy). If blocked, the caller signs the user out and shows
// a clear message.
//
// Note: the IP is detected client-side via ipify.org. Trust isn't the
// goal here — this is anti-account-sharing for normal users, not a
// security boundary against motivated attackers (those would need to
// be stopped at the auth/RLS layer).

import { rpcDirect } from './supabase';

const DEVICE_KEY = 'autobook-device-id-v1';

// Stable UUID for this browser. Generated on first read, persisted.
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      // crypto.randomUUID is available in all modern browsers + Electron.
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    // localStorage blocked (private mode?) — fall back to per-session id.
    return `eph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

let _ipPromise = null;
async function detectPublicIp() {
  if (_ipPromise) return _ipPromise;
  _ipPromise = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch('https://api.ipify.org?format=json', { signal: ctrl.signal });
      clearTimeout(t);
      const j = await r.json();
      return typeof j?.ip === 'string' ? j.ip : null;
    } catch {
      // Offline / blocked — return null and let the server treat it as
      // "no IP" (will only allow if device is brand new or known).
      return null;
    }
  })();
  return _ipPromise;
}

// Round-trip the device claim. Returns the parsed RPC response.
//   { status: 'allowed', reason: 'known_device'|'new_device'|'same_ip' }
//   { status: 'blocked', reason: 'device_limit', message: '...' }
//   { status: 'unauthenticated' }
//   { status: 'unavailable' } — RPC threw / timed out (treated as allowed)
export async function claimDeviceForUser() {
  const deviceId = getDeviceId();
  const ip = await detectPublicIp();
  const userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 500);
  try {
    const result = await rpcDirect('claim_device', {
      p_device_id: deviceId,
      p_ip: ip,
      p_user_agent: userAgent,
    }, { label: 'Claim device', timeoutMs: 10_000, useUserToken: true });
    return result || { status: 'unavailable' };
  } catch (e) {
    // Network glitch or RPC not installed — don't lock people out.
    console.info('[claimDevice] failed:', e?.message);
    return { status: 'unavailable', message: e?.message };
  }
}
