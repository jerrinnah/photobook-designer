import { useState, useEffect } from 'react';
import { buildShareUrl } from '../utils/sharing';

// Floating bottom-right toast that shows share progress AFTER the
// ShareModal closes. Subscribes to `autobook:share-progress` window
// events emitted by sharing.js — no prop-drilling, no global state.
//
// Lifecycle:
//   1. ShareModal dispatches 'share-progress' as upload begins.
//   2. Modal closes — toast picks up and shows the upload bar.
//   3. On 'complete', toast shows the link + Copy button.
//   4. Auto-hides 30s after completion (or on dismiss).

export default function ShareProgressToast() {
  const [state, setState] = useState(null);
  // state shape: null | { stage, done, total, cached, bytes, token, error, dismissed }

  useEffect(() => {
    const onProgress = (e) => {
      setState((prev) => ({ ...(prev || {}), ...e.detail, dismissed: false }));
    };
    const onComplete = (e) => {
      setState((prev) => ({ ...(prev || {}), stage: 'complete', ...e.detail, dismissed: false }));
      // Auto-hide after 30s
      setTimeout(() => setState((s) => (s && s.stage === 'complete' ? { ...s, dismissed: true } : s)), 30_000);
    };
    const onError = (e) => {
      setState({ stage: 'error', error: e.detail?.message || 'Share failed.', dismissed: false });
    };
    const onClear = () => setState(null);

    window.addEventListener('autobook:share-progress', onProgress);
    window.addEventListener('autobook:share-complete', onComplete);
    window.addEventListener('autobook:share-error', onError);
    window.addEventListener('autobook:share-clear', onClear);
    return () => {
      window.removeEventListener('autobook:share-progress', onProgress);
      window.removeEventListener('autobook:share-complete', onComplete);
      window.removeEventListener('autobook:share-error', onError);
      window.removeEventListener('autobook:share-clear', onClear);
    };
  }, []);

  if (!state || state.dismissed) return null;

  const dismiss = () => setState((s) => ({ ...s, dismissed: true }));

  const copy = async () => {
    if (!state.token) return;
    try {
      await navigator.clipboard.writeText(buildShareUrl(state.token));
      setState((s) => ({ ...s, copied: true }));
      setTimeout(() => setState((s) => (s ? { ...s, copied: false } : s)), 1500);
    } catch { /* user can copy manually */ }
  };

  const isComplete = state.stage === 'complete';
  const isError = state.stage === 'error';
  const isCapture = state.stage === 'capture';
  const isUpload = state.stage === 'upload';
  const progressPct = state.total ? Math.round((state.done / state.total) * 100) : 0;

  return (
    <div style={{
      position: 'fixed', right: 18, bottom: 18, zIndex: 250,
      width: 320, maxWidth: 'calc(100vw - 36px)',
      background: '#0e0e0e',
      border: `1px solid ${isError ? '#5a1a1a' : isComplete ? '#2a4a2a' : '#1f1f1f'}`,
      borderRadius: 10,
      padding: '14px 16px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e0e0e0',
      animation: 'autobookSlideUp 200ms ease',
    }}>
      <style>{`
        @keyframes autobookSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{
          fontSize: 16,
          color: isError ? '#e05c5c' : isComplete ? '#6fcf97' : '#4f8ef7',
        }}>
          {isError ? '⚠' : isComplete ? '✓' : '✦'}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>
          {isError ? 'Share failed'
            : isComplete ? 'Share link ready'
            : isCapture ? 'Preparing your share'
            : 'Uploading to share'}
        </span>
        <button onClick={dismiss} style={dismissBtn} title="Dismiss">×</button>
      </div>

      {isError ? (
        <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.5 }}>
          {state.error}
        </div>
      ) : isComplete ? (
        <>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 10, lineHeight: 1.5 }}>
            Send the link to your client — they can review every spread in their browser, no login required.
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              readOnly
              value={buildShareUrl(state.token)}
              onClick={(e) => e.target.select()}
              style={{
                flex: 1, fontSize: 11,
                background: '#161616', border: '1px solid #252525',
                borderRadius: 4, color: '#ccc', padding: '7px 9px',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            <button onClick={copy} style={primaryBtn}>
              {state.copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
            {state.total
              ? `${state.done} of ${state.total}${state.cached ? ` · ${state.cached} cached` : ''}${state.bytes ? ` · ${(state.bytes / 1_000_000).toFixed(1)} MB` : ''}`
              : 'Setting up…'}
          </div>
          {state.total > 0 && (
            <div style={{
              height: 4, background: '#1a1a1a',
              borderRadius: 2, overflow: 'hidden', marginBottom: 6,
            }}>
              <div style={{
                width: `${progressPct}%`, height: '100%',
                background: isCapture ? '#4f8ef7' : '#6fcf97',
                transition: 'width 220ms ease',
              }} />
            </div>
          )}
          <div style={{ fontSize: 10, color: '#555' }}>
            {isCapture ? 'You can keep working — we\'ll notify you when the link is ready.' : 'Upload running in the background.'}
          </div>
        </>
      )}
    </div>
  );
}

const dismissBtn = {
  background: 'none', border: 'none', color: '#666',
  fontSize: 18, cursor: 'pointer', padding: '0 6px',
  lineHeight: 1,
};
const primaryBtn = {
  padding: '7px 12px', fontSize: 11, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 4, cursor: 'pointer',
  whiteSpace: 'nowrap',
};
