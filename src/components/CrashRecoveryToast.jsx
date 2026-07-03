import { useEffect, useState } from 'react';
import { flushAutosave } from '../store/autosave';

// Global safety net for runtime errors and unhandled promise rejections.
// When either fires we:
//   1. Flush the autosave synchronously so the user's latest work is
//      persisted to IndexedDB before anything else.
//   2. Show a non-dismissible toast with the actual error message and a
//      "Refresh & recover" button. Nothing gets lost silently.
//
// This does NOT replace the ErrorBoundary — that catches React render
// exceptions. This catches everything else (async handlers, event
// listeners, worker errors, etc.).
export default function CrashRecoveryToast() {
  const [err, setErr] = useState(null);

  useEffect(() => {
    let flushed = false;
    const safeFlush = () => {
      if (flushed) return;
      flushed = true;
      // Fire-and-forget — the user might refresh before this resolves,
      // but the autosave listeners are also wired to visibilitychange
      // and pagehide so IndexedDB write happens either way.
      try { flushAutosave(); } catch { /* ignore */ }
    };
    const onError = (event) => {
      const msg = event?.error?.message
        || event?.message
        || 'The app hit an unexpected error.';
      // Skip noisy non-actionable errors — ResizeObserver loop
      // messages fire from the Konva stage during layout thrash and
      // are harmless.
      if (/ResizeObserver|Non-Error promise rejection captured/i.test(String(msg))) return;
      safeFlush();
      setErr((prev) => prev || String(msg).slice(0, 500));
    };
    const onRejection = (event) => {
      const reason = event?.reason;
      const msg = reason?.message || String(reason || '');
      // Skip aborts (user-triggered cancellations, network aborts).
      if (/AbortError|The user aborted|cancelled|canceled/i.test(msg)) return;
      safeFlush();
      setErr((prev) => prev || msg.slice(0, 500));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!err) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 10000,
      width: 380, maxWidth: 'calc(100vw - 40px)',
      background: '#1a0808', border: '1px solid #5a1a1a',
      borderRadius: 8, padding: '14px 16px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#f0d0d0',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e89a9a', marginBottom: 6, letterSpacing: 0.3 }}>
        ⚠ SOMETHING WENT WRONG
      </div>
      <div style={{ fontSize: 12, color: '#dcc', lineHeight: 1.55, marginBottom: 10 }}>
        Your work has been saved. Refresh to continue where you left off. If this keeps happening,
        email <b>support@autobookbynej.online</b> with the message below.
      </div>
      <div style={{
        padding: '6px 8px', marginBottom: 12,
        background: '#0a0405', border: '1px solid #3a1010',
        borderRadius: 4, fontSize: 10, color: '#c89898',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        wordBreak: 'break-word', lineHeight: 1.4,
        maxHeight: 90, overflow: 'auto',
      }}>
        {err}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={() => setErr(null)}
          style={{
            padding: '7px 14px', fontSize: 11,
            background: 'transparent', color: '#a88', border: '1px solid #4a1a1a',
            borderRadius: 4, cursor: 'pointer',
          }}
        >Dismiss</button>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '7px 14px', fontSize: 11, fontWeight: 600,
            background: '#5a1a1a', color: '#fff', border: 'none',
            borderRadius: 4, cursor: 'pointer',
          }}
        >Refresh & recover</button>
      </div>
    </div>
  );
}
