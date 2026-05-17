import { useMemo } from 'react';
import { useBookStore } from '../store/useBookStore';
import { TEMPLATES } from '../layouts/templates';

const THUMB_W = 110;
const THUMB_H = 50;

// Small strip of 2 alternative layouts for the active spread.
// Each preview uses the spread's actual photos so the user can see what
// the layout will look like before applying. Click any thumbnail to swap.
export default function AltLayoutSuggestions() {
  const { spreads, activeSpreadId, photos, setTemplate } = useBookStore();
  const spread = spreads.find((s) => s.id === activeSpreadId);
  const activeIdx = spreads.findIndex((s) => s.id === activeSpreadId);

  // Pick 2–3 alternative templates with similar cell counts (±1) so the
  // current photos still fit naturally.
  const alternatives = useMemo(() => {
    if (!spread) return [];
    const currentCount = spread.cells.length;
    const pool = TEMPLATES.filter((t) =>
      !t.printSize &&
      t.category !== 'Cover' &&
      t.category !== 'Event' &&
      t.id !== spread.templateId &&
      Math.abs(t.cells.length - currentCount) <= 1
    );
    if (pool.length === 0) return [];
    // Deterministic per spread+template — shuffle with a seeded sort so the
    // strip stays stable while the user looks at a spread.
    const seed = (spread.id * 7919 + currentCount * 31) % pool.length;
    const rotated = [...pool.slice(seed), ...pool.slice(0, seed)];
    return rotated.slice(0, 3);
  }, [spread]);

  // Hide on cover (index 0) and when there are no alternatives
  if (!spread || activeIdx === 0 || alternatives.length === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
      background: 'rgba(20,20,20,0.92)',
      border: '1px solid #2a2a2a', borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(8px)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
        Try
      </span>
      {alternatives.map((tmpl) => (
        <AltThumb key={tmpl.id} tmpl={tmpl} spread={spread} photos={photos}
          onClick={() => setTemplate(spread.id, tmpl.id)} />
      ))}
    </div>
  );
}

function AltThumb({ tmpl, spread, photos, onClick }) {
  const bgColor = spread.bgColor || '#111';
  return (
    <button
      onClick={onClick}
      title={`Try "${tmpl.name}" (${tmpl.cells.length} cell${tmpl.cells.length === 1 ? '' : 's'})`}
      style={{
        position: 'relative',
        padding: 2,
        background: 'none',
        border: '1px solid #2a2a2a',
        borderRadius: 4,
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4f8ef7'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a2a'; }}
    >
      <div style={{
        width: THUMB_W, height: THUMB_H,
        background: spread.bgMode === 'gradient' && spread.bgGradient
          ? `linear-gradient(${spread.bgGradient.angle}deg, ${spread.bgGradient.stops[0]}, ${spread.bgGradient.stops[1]})`
          : spread.bgMode === 'image' && spread.bgImage
            ? `url(${spread.bgImage}) center/cover`
            : bgColor,
        position: 'relative', borderRadius: 2, overflow: 'hidden',
      }}>
        {tmpl.cells.map((c, i) => {
          // Show the photo currently assigned to the cell at the same index
          // in the active spread, if any — gives a real preview.
          const sourceCell = spread.cells[i];
          const photo = sourceCell?.photoId ? photos.find((p) => p.id === sourceCell.photoId) : null;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${c.x * 100}%`,
              top: `${c.y * 100}%`,
              width: `${c.w * 100}%`,
              height: `${c.h * 100}%`,
              boxSizing: 'border-box',
              border: '1px solid rgba(0,0,0,0.18)',
              background: photo ? undefined : 'rgba(255,255,255,0.04)',
              overflow: 'hidden',
            }}>
              {photo && (
                <img src={photo.src} alt="" style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none', userSelect: 'none',
                  display: 'block',
                }} />
              )}
            </div>
          );
        })}
        {/* Spine */}
        <div style={{
          position: 'absolute', left: '50%', top: 0, bottom: 0,
          width: 1, background: 'rgba(0,0,0,0.25)',
        }} />
      </div>
      <div style={{ fontSize: 8, color: '#666', textAlign: 'center', marginTop: 2, maxWidth: THUMB_W, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {tmpl.name}
      </div>
    </button>
  );
}
