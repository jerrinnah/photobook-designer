import { useEffect, useState } from 'react';
import { getAutosaveMeta } from '../store/autosave';
import { useBookStore } from '../store/useBookStore';

// Boot-time reassurance toast — shows once when the app hydrates from
// a saved project (autosave OR emergency-snapshot recovery). Tells the
// user their work is back so they don't panic-refresh again looking
// for it.
//
// Auto-dismisses after 6s. Skipped entirely on a genuinely blank boot
// (no photos, no captions, no non-default spread structure) so first-
// time visitors don't see it.

const DISMISS_KEY = 'photobook-resume-toast-dismissed-at-v1';

export default function ResumeToast() {
  const [visible, setVisible] = useState(false);
  const [payload, setPayload] = useState({ bookName: '', savedAt: 0, recovered: false });

  useEffect(() => {
    const state = useBookStore.getState();
    const meta = getAutosaveMeta();

    // Skip if there's nothing to reassure about — no photos, no
    // photo-carrying cells, no captions. A truly blank boot doesn't
    // need a "your work is back" toast.
    const hasContent =
      (state.photos?.length ?? 0) > 0 ||
      (state.spreads || []).some((sp) => sp.cells?.some((c) => c.photoId)) ||
      (state.spreads || []).some((sp) => (sp.captions?.length ?? 0) > 0);
    if (!hasContent) return;

    // Skip if we already showed the toast on this exact save timestamp
    // (avoids flashing again on quick reload immediately after boot).
    const savedAt = meta?.savedAt || 0;
    if (!savedAt) return;
    try {
      const last = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (last === savedAt) return;
    } catch { /* ignore */ }

    setPayload({
      bookName: state.bookName || 'your last project',
      savedAt,
      recovered: Boolean(meta?.recovered),
    });
    setVisible(true);
    // Auto-dismiss after 6s. Also remember this savedAt so we don't
    // re-toast for the same restore.
    const t = setTimeout(() => {
      try { localStorage.setItem(DISMISS_KEY, String(savedAt)); } catch { /* ignore */ }
      setVisible(false);
    }, 6000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const relative = (() => {
    const diffSec = Math.round((Date.now() - payload.savedAt) / 1000);
    if (diffSec < 60) return 'moments ago';
    if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
    return `${Math.round(diffSec / 86400)}d ago`;
  })();

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20,
      zIndex: 9200,
      width: 320, maxWidth: 'calc(100vw - 40px)',
      padding: '12px 16px',
      background: payload.recovered ? '#1a1408' : '#0e1a10',
      border: `1px solid ${payload.recovered ? '#3a2a10' : '#2a4a2a'}`,
      borderRadius: 8,
      boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: payload.recovered ? '#f6c98a' : '#6fcf97',
      display: 'flex', alignItems: 'flex-start', gap: 10,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
        {payload.recovered ? '↻' : '✓'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, marginBottom: 4 }}>
          {payload.recovered
            ? 'Restored from crash safety net'
            : 'Continuing where you left off'}
        </div>
        <div style={{ fontSize: 11, lineHeight: 1.55, color: payload.recovered ? '#d8b878' : '#8fd8b0' }}>
          <span style={{ opacity: 0.85 }}>{payload.bookName}</span> — last saved {relative}.
          Refresh anytime; nothing gets lost unless you Reset.
        </div>
      </div>
      <button
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, String(payload.savedAt)); } catch { /* ignore */ }
          setVisible(false);
        }}
        title="Dismiss"
        style={{
          background: 'transparent', border: 'none',
          color: payload.recovered ? '#a88848' : '#5a9070',
          cursor: 'pointer', padding: 0, fontSize: 14,
          alignSelf: 'flex-start', marginTop: -2,
        }}
      >✕</button>
    </div>
  );
}
