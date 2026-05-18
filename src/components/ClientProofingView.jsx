import { useState, useEffect } from 'react';
import { loadShare, setShareStatus } from '../utils/sharing';
import { getScreenDims } from '../layouts/spreadSizes';

// Standalone viewer — what the client opens when they receive the link.
// No editing, no login. Just a clean walkthrough of every spread plus
// Approve / Request changes buttons that report status back to the
// photographer.
//
// Each spread is a pre-rendered screenshot — the viewer just shows the
// image. No template reconstruction, no per-cell math, no fonts.
export default function ClientProofingView({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [share, setShare] = useState(null);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState('pending');

  useEffect(() => {
    let cancelled = false;
    loadShare(token)
      .then((row) => {
        if (cancelled) return;
        setShare(row);
        setStatus(row.status || 'pending');
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Could not load share.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    const onKey = (e) => {
      const total = share?.snapshot?.spreads?.length || 1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, total - 1));
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setIdx((i) => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [share]);

  const handleApprove = async () => {
    setStatus('approved');
    try { await setShareStatus(token, 'approved'); } catch { /* ignore */ }
  };
  const handleChanges = async () => {
    setStatus('changes_requested');
    try { await setShareStatus(token, 'changes_requested'); } catch { /* ignore */ }
  };

  if (loading) return <Screen msg="Loading photobook…" />;
  if (error) return <Screen msg={error} error />;
  if (!share?.snapshot) return <Screen msg="Share not found." error />;

  const snap = share.snapshot;
  const spreads = snap.spreads || [];
  if (spreads.length === 0) return <Screen msg="This share has no spreads." error />;

  // Each captured spread carries its own aspect from when it was rendered.
  // Fall back to spreadSize defaults if missing.
  const spread = spreads[idx];
  const aspectFallback = (() => {
    try {
      const { w, h } = getScreenDims(snap.spreadSizeId, snap.customSize);
      return w / h;
    } catch { return 2; }
  })();
  const aspect = spread?.w && spread?.h ? spread.w / spread.h : aspectFallback;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0a',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e0e0e0',
    }}>
      {/* Header — designer brand */}
      <div className="safe-top" style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 24px',
        borderBottom: '1px solid #1a1a1a',
        background: '#0c0c0c',
      }}>
        {share.brand_logo_url ? (
          <img src={share.brand_logo_url} alt="" style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: '50%' }} />
        ) : (
          <div style={{ height: 28, width: 28, borderRadius: '50%', background: '#1a3580', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>
            {(share.brand_name || 'A').slice(0, 1).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {snap.bookName || share.project_name || 'Photobook preview'}
          </div>
          <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
            from {share.brand_name || 'AutoBook by NEJ'} · {spreads.length} spread{spreads.length === 1 ? '' : 's'}
          </div>
        </div>
        <StatusPill status={status} />
      </div>

      {/* Preview area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, overflow: 'auto' }}>
        <SpreadImage spread={spread} aspect={aspect} />

        {/* Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18 }}>
          <button onClick={() => setIdx((i) => Math.max(i - 1, 0))} disabled={idx === 0} style={navBtn(idx === 0)}>‹</button>
          <span style={{ fontSize: 12, color: '#aaa', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'center' }}>
            {idx + 1} / {spreads.length}
          </span>
          <button onClick={() => setIdx((i) => Math.min(i + 1, spreads.length - 1))} disabled={idx === spreads.length - 1} style={navBtn(idx === spreads.length - 1)}>›</button>
        </div>

        {/* Decision buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={handleApprove} disabled={status === 'approved'} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 600,
            background: status === 'approved' ? '#0e1a10' : '#1a4a2a',
            color: status === 'approved' ? '#6fcf97' : '#fff',
            border: `1px solid ${status === 'approved' ? '#2a4a2a' : '#2a6a3a'}`,
            borderRadius: 5, cursor: status === 'approved' ? 'default' : 'pointer',
          }}>
            {status === 'approved' ? '✓ Approved' : '✓ Approve'}
          </button>
          <button onClick={handleChanges} disabled={status === 'changes_requested'} style={{
            padding: '10px 20px', fontSize: 13, fontWeight: 600,
            background: status === 'changes_requested' ? '#2a0808' : '#2a1a08',
            color: status === 'changes_requested' ? '#e05c5c' : '#f6c90e',
            border: `1px solid ${status === 'changes_requested' ? '#5a1a1a' : '#3a2a10'}`,
            borderRadius: 5, cursor: status === 'changes_requested' ? 'default' : 'pointer',
          }}>
            {status === 'changes_requested' ? '↺ Changes requested' : '↺ Request changes'}
          </button>
        </div>

        <div style={{ fontSize: 10, color: '#444', marginTop: 16, textAlign: 'center' }}>
          Use ← → arrows to navigate · Powered by AutoBook by NEJ
        </div>
      </div>
    </div>
  );
}

// Single spread display — pure image render, no canvas.
function SpreadImage({ spread, aspect }) {
  const previewW = Math.min(window.innerWidth * 0.86, 1400);
  const previewH = Math.round(previewW / aspect);
  return (
    <div style={{
      width: previewW, height: previewH,
      background: '#111',
      boxShadow: '0 12px 60px rgba(0,0,0,0.7)',
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      {spread?.imageUrl ? (
        <img
          src={spread.imageUrl}
          alt={`Spread ${spread.id}`}
          style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
          draggable={false}
        />
      ) : (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 11 }}>
          (no image)
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const styles = {
    pending:           { bg: '#1a1408', border: '#3a2a10', color: '#f6c90e', label: 'Pending review' },
    approved:          { bg: '#0e1a10', border: '#2a4a2a', color: '#6fcf97', label: 'Approved' },
    changes_requested: { bg: '#2a0808', border: '#5a1a1a', color: '#e05c5c', label: 'Changes requested' },
  };
  const s = styles[status] || styles.pending;
  return (
    <span style={{
      fontSize: 10, color: s.color, background: s.bg,
      border: `1px solid ${s.border}`,
      padding: '4px 10px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600,
    }}>
      ● {s.label}
    </span>
  );
}

function Screen({ msg, error }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12,
      color: error ? '#e05c5c' : '#aaa',
      fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13,
    }}>
      <div>{msg}</div>
      {error && (
        <a href="/" style={{ color: '#666', fontSize: 11, textDecoration: 'none', borderBottom: '1px dashed #333' }}>
          ← Go to AutoBook
        </a>
      )}
    </div>
  );
}

const navBtn = (disabled) => ({
  background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4,
  color: disabled ? '#333' : '#aaa', fontSize: 18,
  cursor: disabled ? 'default' : 'pointer',
  padding: '6px 14px', lineHeight: 1,
});
