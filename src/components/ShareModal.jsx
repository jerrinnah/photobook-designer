import { useState, useEffect } from 'react';
import { useBookStore } from '../store/useBookStore';
import { useAuthUser } from '../utils/supabase';
import { getEffectiveTier } from '../utils/premium';
import { createShare, getMyShares, deleteShare, buildShareUrl, getSpreadFeedback } from '../utils/sharing';
import UpgradeModal from './UpgradeModal';

const STATUS_STYLES = {
  pending:            { color: '#888',     label: 'Pending' },
  approved:           { color: '#6fcf97',  label: 'Approved' },
  changes_requested:  { color: '#e05c5c',  label: 'Changes requested' },
};

export default function ShareModal({ open, onClose, stageRef }) {
  const state = useBookStore();
  const setActiveSpread = useBookStore((s) => s.setActiveSpread);
  const user = useAuthUser();
  const isPremium = getEffectiveTier(user) !== 'free';
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } | null
  const [error, setError] = useState(null);
  const [shares, setShares] = useState([]);
  const [lastLink, setLastLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const refresh = async () => {
    if (!user?.id || !isPremium) return;
    const list = await getMyShares();
    setShares(list);
  };

  useEffect(() => {
    if (open) {
      refresh();
      setLastLink(null);
      setError(null);
      setCopied(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    if (!isPremium) { setShowUpgrade(true); return; }
    if (!stageRef?.current) { setError('Editor not ready. Try again in a moment.'); return; }
    setCreating(true);
    setError(null);
    setProgress({ stage: 'capture', done: 0, total: state.spreads?.length || 0 });
    try {
      const token = await createShare(
        {
          bookName: state.bookName,
          spreadSizeId: state.spreadSizeId,
          customSize: state.customSize,
          gap: state.gap,
          blendEdges: state.blendEdges,
          spreads: state.spreads,
        },
        {
          stageRef,
          setActiveSpread,
          originalActiveId: state.activeSpreadId,
        },
        (p) => setProgress(p),
      );
      const url = buildShareUrl(token);
      setLastLink(url);
      await refresh();
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      } catch { /* user can copy manually */ }
    } catch (err) {
      setError(err.message || 'Failed to create share.');
    } finally {
      setCreating(false);
      setProgress(null);
    }
  };

  const handleCopy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleDelete = async (token) => {
    if (!confirm('Revoke this share link? Anyone who has it will lose access.')) return;
    await deleteShare(token);
    await refresh();
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', border: '1px solid #1f1f1f',
        borderRadius: 10, padding: '22px 26px',
        width: 520, maxWidth: '94vw',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Share for client review</span>
          {!isPremium && (
            <span style={{ fontSize: 9, color: '#f6c90e', background: '#3a2a08', padding: '2px 8px', borderRadius: 3, letterSpacing: 0.5 }}>
              ✦ PREMIUM
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
          {isPremium
            ? 'Generates an unguessable read-only link. Send it to your client — they can preview every spread in their browser without signing in. You\'ll see when they\'ve opened it and what status they\'ve set.'
            : 'Premium users can share a read-only preview link with clients. Clients view every spread in their browser, no login required.'}
        </div>

        <button onClick={handleCreate} disabled={creating || !isPremium} style={{
          padding: '10px 16px', fontSize: 12, fontWeight: 600,
          background: '#1a3580', color: '#fff', border: 'none',
          borderRadius: 5,
          cursor: (creating || !isPremium) ? 'not-allowed' : 'pointer',
          opacity: (creating || !isPremium) ? 0.5 : 1,
          marginBottom: 12,
        }}>
          {creating
            ? (progress && progress.total > 0
                ? `${progress.stage === 'capture' ? 'Processing' : 'Uploading'}… ${progress.done} / ${progress.total}${progress.cached ? ` · ${progress.cached} cached` : ''}${progress.bytes ? ` · ${(progress.bytes / 1_000_000).toFixed(1)} MB` : ''}`
                : 'Generating link…')
            : '✦ Generate share link'}
        </button>

        {error && (
          <div style={{ padding: '8px 10px', marginBottom: 10, background: '#1a0808', border: '1px solid #5a1a1a', color: '#e05c5c', fontSize: 11, borderRadius: 5 }}>
            {error}
          </div>
        )}

        {lastLink && (
          <div style={{
            padding: '12px 14px', marginBottom: 12,
            background: '#0e1a10', border: '1px solid #2a4a2a',
            borderRadius: 6,
          }}>
            <div style={{ fontSize: 11, color: '#6fcf97', marginBottom: 6 }}>
              ✓ Share link created {copied && '· copied to clipboard'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" readOnly value={lastLink} onFocus={(e) => e.target.select()} style={{
                flex: 1, background: '#0a0a0a', border: '1px solid #1a1a1a', color: '#aaa',
                fontSize: 10, padding: '6px 8px', borderRadius: 3, outline: 'none', fontFamily: 'monospace',
              }} />
              <button onClick={() => handleCopy(lastLink)} style={smallBtn}>Copy</button>
            </div>
          </div>
        )}

        {/* Existing shares */}
        {isPremium && shares.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 }}>
              Active shares
            </div>
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {shares.map((s) => (
                <ShareRow
                  key={s.token}
                  share={s}
                  onCopy={() => handleCopy(buildShareUrl(s.token))}
                  onDelete={() => handleDelete(s.token)}
                />
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>

        <UpgradeModal open={showUpgrade} blockedFeature="client proofing" onClose={() => setShowUpgrade(false)} />
      </div>
    </div>
  );
}

// One row in the "Active shares" list with expand-to-view-feedback support.
function ShareRow({ share, onCopy, onDelete }) {
  const style = STATUS_STYLES[share.status] || STATUS_STYLES.pending;
  const commentCount = share.comment_count || 0;
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState(null); // null = not loaded yet

  const toggleExpanded = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && feedback === null) {
      const rows = await getSpreadFeedback(share.token);
      // Group by spread_idx
      const grouped = {};
      rows.forEach((r) => {
        (grouped[r.spread_idx] = grouped[r.spread_idx] || []).push(r);
      });
      setFeedback(grouped);
    }
  };

  return (
    <div style={{
      padding: '10px 12px',
      background: '#161616',
      border: `1px solid ${commentCount > 0 ? '#5a1a1a' : '#1f1f1f'}`,
      borderRadius: 5,
      marginBottom: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {share.project_name || 'Untitled'}
          </div>
          <div style={{ fontSize: 10, color: '#666', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: style.color }}>● {style.label}</span>
            <span>{share.view_count || 0} view{(share.view_count || 0) === 1 ? '' : 's'}</span>
            {commentCount > 0 && (
              <button onClick={toggleExpanded} style={{
                background: 'none', border: 'none', padding: 0,
                color: '#e05c5c', cursor: 'pointer', fontSize: 10,
                textDecoration: 'underline',
              }}>
                💬 {commentCount} note{commentCount === 1 ? '' : 's'} {expanded ? '▾' : '▸'}
              </button>
            )}
            <span>· {formatDate(share.created_at)}</span>
          </div>
        </div>
        <button onClick={onCopy} style={smallBtn} title="Copy link">⎘</button>
        <button onClick={onDelete} style={{ ...smallBtn, color: '#e05c5c' }} title="Revoke link">✕</button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #232323' }}>
          {feedback === null ? (
            <div style={{ fontSize: 11, color: '#555' }}>Loading notes…</div>
          ) : Object.keys(feedback).length === 0 ? (
            <div style={{ fontSize: 11, color: '#555' }}>No notes yet.</div>
          ) : (
            Object.keys(feedback)
              .map(Number)
              .sort((a, b) => a - b)
              .map((idx) => (
                <div key={idx} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: '#999', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                    Spread {idx + 1}
                  </div>
                  {feedback[idx].map((f) => (
                    <div key={f.created_at + f.comment} style={{
                      padding: '7px 9px', marginBottom: 4,
                      background: '#0e0e0e', border: '1px solid #232323',
                      borderRadius: 3, fontSize: 11, color: '#ccc', lineHeight: 1.5,
                    }}>
                      <div>{f.comment}</div>
                      <div style={{ fontSize: 9, color: '#555', marginTop: 3 }}>
                        {new Date(f.created_at).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

const smallBtn = {
  padding: '6px 10px', fontSize: 11,
  background: '#1a1a1a', border: '1px solid #2a2a2a',
  borderRadius: 3, color: '#aaa', cursor: 'pointer',
};
const btnGhost = {
  padding: '8px 14px', fontSize: 12,
  background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
