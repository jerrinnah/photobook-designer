import { useState } from 'react';
import { useBookStore } from '../store/useBookStore';
import { SPREAD_SIZES, getEffectiveExportSize } from '../layouts/spreadSizes';

// Standard print sizes (inches) for DPI guidance
const PRINT_SIZES = [
  { label: '4×6"',    w: 4,  h: 6  },
  { label: '5×7"',    w: 5,  h: 7  },
  { label: '8×10"',   w: 8,  h: 10 },
  { label: '8×12"',   w: 8,  h: 12 },
  { label: '11×14"',  w: 11, h: 14 },
  { label: '12×18"',  w: 12, h: 18 },
  { label: '16×20"',  w: 16, h: 20 },
  { label: '20×30"',  w: 20, h: 30 },
];

function dpiColor(dpi) {
  if (dpi >= 300) return '#6fcf97';
  if (dpi >= 150) return '#f6c90e';
  return '#e05c5c';
}

function dpiLabel(dpi) {
  if (dpi >= 300) return 'Print quality';
  if (dpi >= 150) return 'Acceptable';
  return 'Too low';
}

function SpreadMiniature({ spread, cmyk, photos }) {
  const usedPhotos = spread.cells
    .filter((c) => c.photoId)
    .map((c) => photos.find((p) => p.id === c.photoId))
    .filter(Boolean);

  const bgColor = spread.bgColor || '#111';

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      paddingTop: '50%',
      borderRadius: 4,
      overflow: 'hidden',
      background: spread.bgMode === 'gradient' && spread.bgGradient
        ? `linear-gradient(${spread.bgGradient.angle}deg, ${spread.bgGradient.stops[0]}, ${spread.bgGradient.stops[1]})`
        : spread.bgMode === 'image' && spread.bgImage
          ? `url(${spread.bgImage}) center/cover`
          : bgColor,
      filter: cmyk ? 'saturate(0.78) contrast(1.08) brightness(0.94)' : 'none',
      transition: 'filter 0.3s',
    }}>
      {/* Cell thumbnails */}
      {spread.cellGeometry.map((geo, i) => {
        const photo = spread.cells[i]?.photoId
          ? photos.find((p) => p.id === spread.cells[i].photoId)
          : null;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: `${geo.x * 100}%`,
            top: `${geo.y * 100}%`,
            width: `${geo.w * 100}%`,
            height: `${geo.h * 100}%`,
            boxSizing: 'border-box',
            border: '1px solid rgba(0,0,0,0.2)',
            overflow: 'hidden',
            background: photo ? undefined : '#1e1e1e',
          }}>
            {photo && (
              <img
                src={photo.src}
                alt=""
                style={{
                  width: '100%', height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  display: 'block',
                  filter: spread.cells[i]?.effects?.bw ? 'grayscale(1)' : spread.cells[i]?.effects?.sepia ? 'sepia(1)' : 'none',
                }}
              />
            )}
          </div>
        );
      })}

      {/* Captions */}
      {spread.captions?.map((cap) => (
        <div key={cap.id} style={{
          position: 'absolute',
          left: `${cap.x * 100}%`,
          top: `${cap.y * 100}%`,
          width: `${cap.w * 100}%`,
          fontSize: Math.round(cap.fontSize * 0.08),
          color: cap.color || '#fff',
          fontWeight: cap.bold ? 'bold' : 'normal',
          fontStyle: cap.italic ? 'italic' : 'normal',
          textAlign: cap.align || 'left',
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          lineHeight: 1.2,
          pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
        }}>{cap.text}</div>
      ))}

      {/* Spread role badge */}
      {spread.role && (
        <div style={{
          position: 'absolute', top: 3, left: 3,
          fontSize: 7, fontWeight: 'bold', letterSpacing: 0.5,
          color: spread.role === 'cover' ? '#f6c90e' : '#aaa',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}>
          {spread.role.toUpperCase()}
        </div>
      )}

      {/* Photo count */}
      <div style={{
        position: 'absolute', bottom: 2, right: 3,
        fontSize: 7, color: 'rgba(255,255,255,0.5)',
      }}>
        {usedPhotos.length}/{spread.cells.length}
      </div>
    </div>
  );
}

export default function PrintPreview({ onClose, mobile = false }) {
  const { spreads, photos, spreadSizeId, customSize, bookName } = useBookStore();
  const [cmyk, setCmyk] = useState(false);
  const [selectedSize, setSelectedSize] = useState('4×6"');

  const { exportW, exportH } = getEffectiveExportSize(spreadSizeId, customSize);
  const spreadLabel = SPREAD_SIZES.find((s) => s.id === spreadSizeId)?.label || spreadSizeId;

  // Bleed standard: 0.125" each side at 300 dpi
  const bleedPx = Math.round(0.125 * 300);

  const chosenSize = PRINT_SIZES.find((s) => s.label === selectedSize) || PRINT_SIZES[0];
  const halfW = exportW / 2; // single page = half spread
  const dpiAtW = Math.round(halfW / chosenSize.w);
  const dpiAtH = Math.round(exportH / chosenSize.h);
  const effectiveDpi = Math.min(dpiAtW, dpiAtH);

  const totalPhotos = photos.length;
  const usedIds = new Set(spreads.flatMap((sp) => sp.cells.map((c) => c.photoId).filter(Boolean)));
  const placedPhotos = usedIds.size;
  const emptyCells = spreads.reduce((n, sp) => n + sp.cells.filter((c) => !c.photoId).length, 0);
  const totalCells = spreads.reduce((n, sp) => n + sp.cells.length, 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex',
      flexDirection: 'column',
      color: '#e0e0e0',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', borderBottom: '1px solid #1a1a1a',
        background: '#0c0c0c', flexShrink: 0,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>Print Preview</span>
        <span style={{ fontSize: 11, color: '#555' }}>·</span>
        <span style={{ fontSize: 11, color: '#555' }}>{bookName}</span>

        <div style={{ flex: 1 }} />

        {/* CMYK toggle */}
        <button
          onClick={() => setCmyk((v) => !v)}
          style={{
            padding: '5px 12px', fontSize: 11, borderRadius: 4, cursor: 'pointer',
            background: cmyk ? '#2a1a10' : '#181818',
            color: cmyk ? '#d4843a' : '#666',
            border: `1px solid ${cmyk ? '#4a3020' : '#252525'}`,
          }}
          title="Simulate how CMYK printing compresses the RGB gamut"
        >
          {cmyk ? '◎ CMYK Sim ON' : '◎ CMYK Sim OFF'}
        </button>

        <button
          onClick={onClose}
          style={{
            padding: '5px 12px', background: 'transparent', border: '1px solid #2a2a2a',
            borderRadius: 4, color: '#666', fontSize: 11, cursor: 'pointer',
          }}
        >✕ Close</button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: mobile ? 'column' : 'row', overflow: 'hidden' }}>
        {/* Left (top on mobile): specs panel */}
        <div style={{
          width: mobile ? '100%' : 240,
          maxHeight: mobile ? '40%' : 'none',
          background: '#111',
          borderRight: mobile ? 'none' : '1px solid #1a1a1a',
          borderBottom: mobile ? '1px solid #1a1a1a' : 'none',
          overflowY: 'auto', padding: '14px 14px',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
            Print Specs
          </div>

          {/* Project stats */}
          <div style={{ background: '#181818', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>Project</div>
            {[
              ['Spreads', spreads.length],
              ['Total cells', totalCells],
              ['Photos placed', `${placedPhotos} / ${totalPhotos}`],
              ['Empty cells', emptyCells, emptyCells > 0 ? '#f6c90e' : '#6fcf97'],
            ].map(([label, val, col]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#555' }}>{label}</span>
                <span style={{ fontSize: 10, color: col || '#aaa', fontVariantNumeric: 'tabular-nums' }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Export size */}
          <div style={{ background: '#181818', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 6 }}>Export resolution</div>
            {[
              ['Size preset', spreadLabel, '#888'],
              ['Spread px', `${exportW} × ${exportH}`, '#aaa'],
              ['Page px', `${Math.round(exportW / 2)} × ${exportH}`, '#aaa'],
              ['Bleed add', `+${bleedPx}px per edge at 300 dpi`, '#555'],
            ].map(([label, val, col]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 2 }}>
                <span style={{ fontSize: 10, color: '#555' }}>{label}</span>
                <span style={{ fontSize: 10, color: col, textAlign: 'right', maxWidth: 120 }}>{val}</span>
              </div>
            ))}
          </div>

          {/* DPI calculator */}
          <div style={{ background: '#181818', borderRadius: 6, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 8 }}>DPI at print size</div>
            <select
              value={selectedSize}
              onChange={(e) => setSelectedSize(e.target.value)}
              style={{
                width: '100%', background: '#141414', border: '1px solid #252525',
                borderRadius: 3, color: '#888', fontSize: 10, padding: '3px 5px',
                marginBottom: 8, cursor: 'pointer', outline: 'none',
              }}
            >
              {PRINT_SIZES.map((s) => (
                <option key={s.label} value={s.label}>{s.label}</option>
              ))}
            </select>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#555' }}>Effective DPI</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: dpiColor(effectiveDpi) }}>
                {effectiveDpi}
              </span>
            </div>
            <div style={{
              fontSize: 10, color: dpiColor(effectiveDpi),
              padding: '4px 7px', background: 'rgba(0,0,0,0.3)',
              borderRadius: 3, borderLeft: `2px solid ${dpiColor(effectiveDpi)}`,
            }}>
              {dpiLabel(effectiveDpi)} — {effectiveDpi >= 300 ? 'sharp edges guaranteed' : effectiveDpi >= 150 ? 'may show softness close up' : 'recommend smaller print size'}
            </div>

            <div style={{ marginTop: 10, fontSize: 9, color: '#444', lineHeight: 1.6 }}>
              {PRINT_SIZES.map((s) => {
                const dpi = Math.min(Math.round(halfW / s.w), Math.round(exportH / s.h));
                return (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                    <span>{s.label}</span>
                    <span style={{ color: dpiColor(dpi) }}>{dpi} dpi</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CMYK info */}
          <div style={{ background: cmyk ? '#1a1208' : '#181818', borderRadius: 6, padding: '10px 12px', border: cmyk ? '1px solid #3a2a10' : '1px solid transparent', transition: 'all 0.2s' }}>
            <div style={{ fontSize: 10, color: cmyk ? '#d4843a' : '#555', marginBottom: 6 }}>CMYK Simulation</div>
            <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>
              {cmyk ? (
                <>
                  <div style={{ color: '#888', marginBottom: 4 }}>Active — preview shows:</div>
                  <div>· Reduced saturation (~78%)</div>
                  <div>· Slightly higher contrast</div>
                  <div>· Darker highlights</div>
                  <div style={{ marginTop: 6, color: '#555' }}>
                    CMYK printing cannot reproduce all RGB colours. Neon blues/greens and some reds shift noticeably.
                  </div>
                </>
              ) : (
                <div>Toggle to simulate ink-on-paper gamut compression. Useful for checking vibrant colours before sending to press.</div>
              )}
            </div>
          </div>

          {/* Colour profile note */}
          <div style={{ marginTop: 10, fontSize: 9, color: '#444', lineHeight: 1.6 }}>
            <div style={{ color: '#555', marginBottom: 3 }}>Colour profile tips</div>
            <div>· Export at sRGB for online labs</div>
            <div>· Request ICC profile from your printer</div>
            <div>· Add 3mm bleed when uploading</div>
            <div>· Safe zone: 5mm inside trim</div>
          </div>
        </div>

        {/* Right: spread thumbnails */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {cmyk && (
            <div style={{
              marginBottom: 12, padding: '7px 12px',
              background: '#1a1208', border: '1px solid #3a2a10', borderRadius: 5,
              fontSize: 10, color: '#d4843a',
            }}>
              CMYK simulation active — colours appear as they would on an offset press
            </div>
          )}

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {spreads.map((spread, idx) => (
              <div key={spread.id}>
                <div style={{ fontSize: 10, color: '#333', marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Spread {idx + 1}{spread.role ? ` · ${spread.role.toUpperCase()}` : ''}</span>
                  <span style={{ color: '#2a2a2a' }}>{spread.cells.length} cells</span>
                </div>
                <SpreadMiniature spread={spread} cmyk={cmyk} photos={photos} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, fontSize: 9, color: '#333', textAlign: 'center' }}>
            {spreads.length} spread{spreads.length !== 1 ? 's' : ''} · {totalCells} cells · Export at {exportW}×{exportH}px
          </div>
        </div>
      </div>
    </div>
  );
}
