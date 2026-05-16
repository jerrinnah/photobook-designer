import { useRef, useState } from 'react';
import { useBookStore } from '../store/useBookStore';
import { useLocalStorage } from '../hooks/useLocalStorage';
import CollapsedRail from './CollapsedRail';

const THUMB_W = 110;
const THUMB_H = 56;

const ROLE_COLORS = { cover: '#f6c90e', back: '#888' };

function SpreadThumb({ spread, active, onDragStart, onDragOver, onDrop, isDragTarget }) {
  const { photos, setActiveSpread, removeSpread, duplicateSpread, setSpreadRole, setSpreadBgColor } = useBookStore();
  const geo = spread.cellGeometry || [];
  const colorInputRef = useRef(null);

  const roleLabels = [null, 'cover', 'back'];
  const nextRole = (current) => roleLabels[(roleLabels.indexOf(current) + 1) % roleLabels.length];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => setActiveSpread(spread.id)}
      style={{
        position: 'relative',
        padding: '6px 8px 4px',
        cursor: 'pointer',
        background: active ? '#1e2535' : isDragTarget ? '#1a2a1a' : 'transparent',
        borderLeft: active ? '2px solid #4f8ef7' : isDragTarget ? '2px solid #4a8a4a' : '2px solid transparent',
        marginBottom: 2,
        userSelect: 'none',
      }}
    >
      <svg width={THUMB_W} height={THUMB_H} style={{ display: 'block', borderRadius: 2,
        background: spread.bgMode === 'gradient' && spread.bgGradient
          ? `linear-gradient(${spread.bgGradient.angle}deg, ${spread.bgGradient.stops[0]}, ${spread.bgGradient.stops[1]})`
          : spread.bgMode === 'image' && spread.bgImage
          ? `url(${spread.bgImage}) center/cover`
          : spread.bgColor || '#0d0d0d',
        outline: '1px solid #1e1e1e',
      }}>
        {geo.map((c, i) => {
          const cell = spread.cells[i];
          const photo = cell ? photos.find((p) => p.id === cell.photoId) : null;
          const x = c.x * THUMB_W;
          const y = c.y * THUMB_H;
          const w = c.w * THUMB_W;
          const h = c.h * THUMB_H;
          return (
            <g key={i}>
              <rect
                x={x + 0.5} y={y + 0.5}
                width={w - 1} height={h - 1}
                fill={photo ? 'transparent' : 'rgba(255,255,255,0.04)'}
                stroke="rgba(0,0,0,0.25)" strokeWidth={0.5}
              />
              {photo && (
                <image
                  href={photo.src}
                  x={x + 0.5} y={y + 0.5}
                  width={w - 1} height={h - 1}
                  preserveAspectRatio="xMidYMid slice"
                  style={{ filter: cell?.effects?.bw ? 'grayscale(1)' : cell?.effects?.sepia ? 'sepia(1)' : 'none' }}
                />
              )}
            </g>
          );
        })}
        {/* Spine */}
        <line x1={THUMB_W/2} y1={0} x2={THUMB_W/2} y2={THUMB_H} stroke="rgba(0,0,0,0.35)" strokeWidth={0.5} strokeDasharray="2 2" />
        {spread.role && (
          <text x={4} y={11} fontSize={7} fontWeight="bold" fill={ROLE_COLORS[spread.role] || '#aaa'} style={{ letterSpacing: 0.5, textShadow: '0 1px 2px rgba(0,0,0,0.6)' }}>
            {spread.role.toUpperCase()}
          </text>
        )}
      </svg>

      <div style={{ fontSize: 10, color: '#3a3a3a', marginTop: 3 }}>Spread {spread.id}</div>

      {/* Per-spread controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}
        onClick={(e) => e.stopPropagation()}>
        {/* BG color swatch */}
        <div
          title="Background color"
          onClick={() => colorInputRef.current?.click()}
          style={{
            width: 14, height: 14,
            background: spread.bgColor || '#111',
            border: '1px solid #333',
            borderRadius: 2,
            cursor: 'pointer',
            flexShrink: 0,
          }}
        />
        <input
          ref={colorInputRef}
          type="color"
          value={spread.bgColor || '#111111'}
          onChange={(e) => setSpreadBgColor(spread.id, e.target.value)}
          style={{ display: 'none' }}
        />

        {/* Role toggle badge */}
        <button
          title="Toggle cover / back / none"
          onClick={() => setSpreadRole(spread.id, nextRole(spread.role))}
          style={{
            fontSize: 8,
            fontWeight: 'bold',
            background: 'none',
            border: `1px solid ${spread.role ? (ROLE_COLORS[spread.role] || '#555') : '#2a2a2a'}`,
            borderRadius: 2,
            color: spread.role ? (ROLE_COLORS[spread.role] || '#aaa') : '#333',
            cursor: 'pointer',
            padding: '1px 4px',
            lineHeight: 1.4,
            letterSpacing: 0.5,
          }}
        >
          {spread.role ? spread.role.toUpperCase() : '—'}
        </button>

        {/* Duplicate */}
        <button
          title="Duplicate spread"
          onClick={() => duplicateSpread(spread.id)}
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            background: 'none',
            border: 'none',
            color: '#3a3a3a',
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
          }}
        >
          ⊞
        </button>

        {/* Remove */}
        <button
          title="Remove spread"
          onClick={(e) => { e.stopPropagation(); removeSpread(spread.id); }}
          style={{
            fontSize: 11,
            background: 'none',
            border: 'none',
            color: '#3a3a3a',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function SpreadNav({ mobile = false }) {
  const { spreads, activeSpreadId, addSpread, addMultipleSpreads, reorderSpreads } = useBookStore();
  const [count, setCount] = useState(1);
  const [draggedId, setDraggedId] = useState(null);
  const [dragTargetId, setDragTargetId] = useState(null);
  const [collapsed, setCollapsed] = useLocalStorage('spreadnav-collapsed', false);

  const handleAdd = () => {
    if (count === 1) addSpread();
    else addMultipleSpreads(count);
  };

  if (!mobile && collapsed) {
    return <CollapsedRail label="Spreads" side="left" onExpand={() => setCollapsed(false)} />;
  }

  return (
    <div style={{ width: mobile ? '100%' : 130, height: mobile ? '100%' : undefined, background: '#111', borderRight: mobile ? 'none' : '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 6px 6px 10px' }}>
        <span style={{ fontSize: 10, color: '#444', letterSpacing: 1, textTransform: 'uppercase' }}>Spreads</span>
        {!mobile && (
          <button onClick={() => setCollapsed(true)} title="Collapse panel" style={collapseBtn}>‹</button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {spreads.map((sp) => (
          <SpreadThumb
            key={sp.id}
            spread={sp}
            active={sp.id === activeSpreadId}
            isDragTarget={dragTargetId === sp.id && draggedId !== sp.id}
            onDragStart={(e) => {
              setDraggedId(sp.id);
              e.dataTransfer.setData('spreadId', String(sp.id));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragTargetId(sp.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const fromId = parseInt(e.dataTransfer.getData('spreadId'));
              if (fromId && fromId !== sp.id) reorderSpreads(fromId, sp.id);
              setDraggedId(null);
              setDragTargetId(null);
            }}
          />
        ))}
      </div>

      {/* Add spreads controls */}
      <div style={{ padding: '8px', borderTop: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#444', whiteSpace: 'nowrap' }}>Add</span>
          <input
            type="number" value={count} min={1} max={50}
            onChange={(e) => setCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
            style={{
              flex: 1, width: 0,
              background: '#181818', border: '1px solid #252525',
              borderRadius: 4, color: '#888', fontSize: 11,
              padding: '3px 5px', outline: 'none',
            }}
          />
          <span style={{ fontSize: 10, color: '#444', whiteSpace: 'nowrap' }}>
            spread{count !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          onClick={handleAdd}
          style={{
            padding: '6px 0', background: '#1a1a1a',
            border: '1px solid #252525', borderRadius: 4,
            color: '#666', fontSize: 11, cursor: 'pointer', width: '100%',
          }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}

const collapseBtn = {
  background: 'none', border: 'none', color: '#555',
  fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
};
