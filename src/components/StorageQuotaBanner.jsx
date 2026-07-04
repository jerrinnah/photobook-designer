import { useEffect, useState } from 'react';

// Watches the browser's storage quota. When usage crosses the WARN
// threshold the banner recommends downloading a backup or deleting an
// old project. When it crosses CRITICAL, autosave writes will
// eventually start failing — the banner says so and encourages
// immediate action.
//
// Uses navigator.storage.estimate() where supported (Chrome, Edge,
// Firefox, Safari 15.2+). Silently no-ops elsewhere.

const WARN_PCT = 80;
const CRITICAL_PCT = 92;
const CHECK_INTERVAL_MS = 60_000; // once a minute is plenty
const DISMISS_KEY = 'autobook-quota-dismissed-until-v1';

export default function StorageQuotaBanner() {
  const [state, setState] = useState(null); // { usedPct, usedMB, quotaMB } | null

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    let cancelled = false;
    const check = async () => {
      try {
        const { usage = 0, quota = 0 } = await navigator.storage.estimate();
        if (cancelled || !quota) return;
        const usedPct = Math.round((usage / quota) * 100);
        const dismissedUntil = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (usedPct < WARN_PCT || Date.now() < dismissedUntil) {
          setState(null);
          return;
        }
        setState({
          usedPct,
          usedMB: Math.round(usage / 1024 / 1024),
          quotaMB: Math.round(quota / 1024 / 1024),
        });
      } catch {
        /* not supported — nothing to show */
      }
    };
    check();
    const t = setInterval(check, CHECK_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  if (!state) return null;
  const critical = state.usedPct >= CRITICAL_PCT;
  return (
    <div style={{
      position: 'fixed', top: 12, left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9500,
      width: 480, maxWidth: 'calc(100vw - 32px)',
      padding: '10px 14px',
      background: critical ? '#1a0808' : '#1a1408',
      border: `1px solid ${critical ? '#5a1a1a' : '#5a3a10'}`,
      borderRadius: 8,
      boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: critical ? '#f0d0d0' : '#f6d8a2',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>
        {critical ? '⛔' : '⚠'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, marginBottom: 3 }}>
          {critical
            ? `BROWSER STORAGE ${state.usedPct}% FULL — AUTOSAVE MAY FAIL SOON`
            : `Browser storage ${state.usedPct}% full`}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 8 }}>
          {state.usedMB} MB used of {state.quotaMB} MB. To avoid losing work, download a backup
          (⌘S / Ctrl+S) or delete an old project from the Projects modal.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
              // Dismiss for 24h — banner comes back if still over threshold tomorrow
              localStorage.setItem(DISMISS_KEY, String(Date.now() + 24 * 60 * 60 * 1000));
              setState(null);
            }}
            style={{
              padding: '5px 10px', fontSize: 10,
              background: 'transparent',
              color: critical ? '#a88' : '#a89060',
              border: `1px solid ${critical ? '#4a1a1a' : '#4a3010'}`,
              borderRadius: 4, cursor: 'pointer',
            }}
          >Dismiss for today</button>
        </div>
      </div>
    </div>
  );
}
