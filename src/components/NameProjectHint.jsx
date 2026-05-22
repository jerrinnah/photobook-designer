import { useState } from 'react';
import { useBookStore } from '../store/useBookStore';
import { useTheme } from '../utils/theme';

// Small gold banner under the toolbar that nudges first-time users to
// name their project. Auto-hides once the name is changed; manually
// dismissible. The hint hides forever once dismissed (per browser).

const DISMISS_KEY = 'photobook-name-hint-dismissed-v1';
const DEFAULTS = new Set(['', 'photobook', 'untitled photobook', 'my first photobook']);

function isDefaultName(name) {
  return DEFAULTS.has((name || '').trim().toLowerCase());
}

export default function NameProjectHint() {
  const { t } = useTheme();
  const bookName = useBookStore((s) => s.bookName);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; }
    catch { return false; }
  });

  if (!isDefaultName(bookName) || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const focusNameInput = () => {
    try {
      const el = document.querySelector('[data-tour="book-name"]');
      if (el) { el.focus(); el.select?.(); }
    } catch { /* ignore */ }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px',
      background: t.mode === 'light'
        ? 'linear-gradient(90deg, #fff8d6 0%, #fffdf3 60%, #ffffff 100%)'
        : 'linear-gradient(90deg, #1a1408 0%, #0e0c08 60%, #0c0c0c 100%)',
      borderBottom: `1px solid ${t.mode === 'light' ? '#e8d27a' : '#3a2a10'}`,
      color: t.text,
      fontSize: 12,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      flexShrink: 0,
      lineHeight: 1.4,
    }}>
      <span style={{ fontSize: 14 }}>✨</span>
      <span style={{ color: t.mode === 'light' ? '#7a5c00' : '#f6c90e', fontWeight: 600 }}>
        Start by naming your project
      </span>
      <span style={{ color: t.textMuted }}>
        — it'll appear in exports, share links, and your Projects list.
      </span>
      <button
        onClick={focusNameInput}
        style={{
          background: t.mode === 'light' ? '#fff3a8' : '#2a1a08',
          color: t.mode === 'light' ? '#7a5c00' : '#f6c90e',
          border: `1px solid ${t.mode === 'light' ? '#e8d27a' : '#3a2a10'}`,
          borderRadius: 4, padding: '4px 10px',
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
      >
        ↑ Name it now
      </button>
      <button
        onClick={dismiss}
        title="Dismiss"
        style={{
          marginLeft: 'auto',
          background: 'none', border: 'none',
          color: t.textMuted,
          fontSize: 14, cursor: 'pointer', padding: '2px 8px',
          borderRadius: 3,
        }}
      >
        ✕
      </button>
    </div>
  );
}
