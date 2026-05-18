import { useState, useEffect } from 'react';
import { Stage, Layer, Rect, Image as KImage, Group, Text as KText } from 'react-konva';
import { loadShare, setShareStatus } from '../utils/sharing';
import { getScreenDims } from '../layouts/spreadSizes';
import useImage from '../hooks/useImage';

// Standalone viewer — what the client opens when they receive the link.
// No editing, no login. Just a clean walkthrough of every spread plus
// Approve / Request changes buttons that report status back to the
// photographer.
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
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, (share?.snapshot?.spreads?.length || 1) - 1));
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
  const photos = snap.photos || [];
  const { w: exportW, h: exportH } = getScreenDims(snap.spreadSizeId, snap.customSize);
  const previewW = Math.min(window.innerWidth * 0.86, 1200);
  const previewH = Math.round(previewW * exportH / exportW);
  const spread = spreads[idx];

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
        <div style={{
          boxShadow: '0 12px 60px rgba(0,0,0,0.7)', borderRadius: 2,
          background: spread?.bgColor || '#111',
        }}>
          {spread && (
            <ProofingStage
              spread={spread} photos={photos}
              gap={snap.gap ?? 3}
              width={previewW} height={previewH}
              exportW={exportW} exportH={exportH}
            />
          )}
        </div>

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
          Use ← → arrows to navigate · {share.brand_name ? `Hosted on AutoBook by NEJ` : 'Powered by AutoBook by NEJ'}
        </div>
      </div>
    </div>
  );
}

// Konva preview of one spread — clipped cells with images + captions.
function ProofingStage({ spread, photos, gap, width, height, exportW, exportH }) {
  return (
    <Stage width={width} height={height}>
      <Layer>
        <Rect x={0} y={0} width={width} height={height} fill={spread.bgColor || '#111'} />
        {(spread.cellGeometry || []).map((geo, i) => {
          const cell = spread.cells?.[i];
          return (
            <ProofingCell key={i}
              geo={geo} cell={cell} photos={photos}
              spreadW={width} spreadH={height} gap={gap} bgColor={spread.bgColor || '#111'}
            />
          );
        })}
        {/* Spine */}
        <Rect x={width/2 - 0.5} y={0} width={1} height={height} fill="rgba(0,0,0,0.25)" />
        {(spread.captions || []).map((cap) => (
          <KText key={cap.id || cap.text}
            x={cap.x * width} y={cap.y * height} width={cap.w * width}
            text={cap.text || ''}
            fontSize={(cap.fontSize || 18) * (width / exportW)}
            fontFamily={cap.fontFamily || 'system-ui'}
            fontStyle={[cap.italic ? 'italic' : '', cap.bold ? 'bold' : ''].filter(Boolean).join(' ') || 'normal'}
            fill={cap.color || '#fff'}
            align={cap.align || 'left'}
            listening={false}
          />
        ))}
      </Layer>
    </Stage>
  );
}

function ProofingCell({ geo, cell, photos, spreadW, spreadH, gap, bgColor }) {
  const photo = cell?.photoId ? photos.find((p) => String(p.id) === String(cell.photoId)) : null;
  const [img] = useImage(photo?.src);
  const x = geo.x * spreadW + gap / 2;
  const y = geo.y * spreadH + gap / 2;
  const w = Math.max(1, geo.w * spreadW - gap);
  const h = Math.max(1, geo.h * spreadH - gap);
  let imgProps = null;
  if (img) {
    const scale = Math.max(w / img.width, h / img.height) * (cell?.zoom || 1);
    const iw = img.width * scale;
    const ih = img.height * scale;
    const cx = cell?.manualCrop
      ? x + w / 2 + (cell.offsetX || 0)
      : x + w / 2;
    const cy = cell?.manualCrop
      ? y + h / 2 + (cell.offsetY || 0)
      : y + ih / 2; // top-align default
    imgProps = { cx, cy, iw, ih };
  }
  return (
    <Group clipX={x} clipY={y} clipWidth={w} clipHeight={h}>
      <Rect x={x} y={y} width={w} height={h} fill={bgColor} />
      {img && imgProps && (
        <KImage image={img} x={imgProps.cx} y={imgProps.cy}
          width={imgProps.iw} height={imgProps.ih}
          offsetX={imgProps.iw / 2} offsetY={imgProps.ih / 2}
          rotation={cell?.rotation || 0} listening={false}
        />
      )}
    </Group>
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
