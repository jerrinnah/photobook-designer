import { useState, useEffect, useMemo } from 'react';
import { useBookStore } from '../store/useBookStore';

// Modal: pick specific spreads + a format, then export only those.
// Only DESIGNED spreads (at least one cell with a photo) appear in the
// list — empty spreads would export blank pages, so they're filtered out.

function isSpreadDesigned(spread) {
  if (!spread?.cells || !Array.isArray(spread.cells)) return false;
  return spread.cells.some((c) => c?.photoId != null);
}

function countPhotos(spread) {
  if (!spread?.cells) return 0;
  return spread.cells.filter((c) => c?.photoId != null).length;
}

function labelFor(spread, index) {
  if (spread?.role === 'cover') return 'Cover';
  // Index is 0-based across the full spread list including cover; we
  // label inner spreads as "Spread 1, 2, …" starting from the first
  // non-cover spread.
  return `Spread ${index}`;
}

export default function SpreadExportPicker({ open, onClose, onExport }) {
  const spreads = useBookStore((s) => s.spreads);
  const [selected, setSelected] = useState(() => new Set());
  const [format, setFormat] = useState('jpg'); // 'jpg' | 'pdf'

  // Build the list of designable spreads with their display indices.
  const items = useMemo(() => {
    if (!spreads) return [];
    let coverSeen = false;
    let innerIdx = 0;
    return spreads
      .map((sp) => {
        const isCover = sp.role === 'cover';
        if (isCover) coverSeen = true;
        else innerIdx += 1;
        return {
          id: sp.id,
          spread: sp,
          designed: isSpreadDesigned(sp),
          photoCount: countPhotos(sp),
          label: labelFor(sp, isCover ? 0 : innerIdx),
        };
      })
      .filter((i) => i.designed);
  }, [spreads]);

  // Reset selection on open — default to all designed spreads
  useEffect(() => {
    if (open) {
      setSelected(new Set(items.map((i) => i.id)));
      setFormat('jpg');
    }
  }, [open, items]);

  if (!open) return null;

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const clearAll  = () => setSelected(new Set());

  const handleExport = () => {
    if (selected.size === 0) return;
    onExport?.({ ids: Array.from(selected), format });
  };

  const allSelected  = selected.size === items.length && items.length > 0;
  const someSelected = selected.size > 0 && !allSelected;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', border: '1px solid #1f1f1f',
        borderRadius: 10, padding: '22px 24px',
        width: 480, maxWidth: '94vw',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Export specific spreads
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 16, lineHeight: 1.5 }}>
          Pick which spreads to export and the file format. Only designed spreads
          (at least one photo placed) are listed.
        </div>

        {/* Format selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <FormatButton active={format === 'jpg'} onClick={() => setFormat('jpg')}>
            ↓ JPGs
            <span style={subLabel}>One file per spread</span>
          </FormatButton>
          <FormatButton active={format === 'pdf'} onClick={() => setFormat('pdf')}>
            ⬡ Print PDF
            <span style={subLabel}>Single multi-page file</span>
          </FormatButton>
        </div>

        {/* Bulk actions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
          <button onClick={selectAll} disabled={allSelected} style={bulkBtn}>
            Select all
          </button>
          <button onClick={clearAll} disabled={selected.size === 0} style={bulkBtn}>
            Clear
          </button>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: '#666' }}>
            {selected.size} of {items.length} selected
          </span>
        </div>

        {/* Spread list */}
        <div style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 6,
          padding: 4, marginBottom: 14,
        }}>
          {items.length === 0 ? (
            <div style={{ padding: 22, textAlign: 'center', color: '#555', fontSize: 12 }}>
              No designed spreads yet. Add photos to at least one spread to export.
            </div>
          ) : items.map((item) => (
            <label key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 4,
              cursor: 'pointer',
              background: selected.has(item.id) ? '#1a2535' : 'transparent',
            }}>
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                style={{ accentColor: '#4f8ef7', cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#ddd', fontWeight: 500, minWidth: 80 }}>
                {item.label}
              </span>
              <span style={{ fontSize: 11, color: '#6fcf97' }}>
                {item.photoCount} photo{item.photoCount === 1 ? '' : 's'}
              </span>
            </label>
          ))}
        </div>

        {someSelected && (
          <div style={{ fontSize: 10, color: '#666', marginBottom: 8 }}>
            Tip: JPGs are renumbered contiguously (01, 02, 03…) regardless of which spreads you skip.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button
            onClick={handleExport}
            disabled={selected.size === 0}
            style={{
              ...btnPrimary,
              opacity: selected.size === 0 ? 0.5 : 1,
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            Export {selected.size} spread{selected.size === 1 ? '' : 's'} →
          </button>
        </div>
      </div>
    </div>
  );
}

function FormatButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1,
      padding: '12px 14px',
      background: active ? '#0e1a26' : '#161616',
      border: `1px solid ${active ? '#2a4a6a' : '#252525'}`,
      borderRadius: 6,
      color: '#fff',
      fontSize: 13, fontWeight: 600,
      cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
    }}>
      {children}
    </button>
  );
}

const subLabel = {
  fontSize: 10, color: '#666', fontWeight: 400,
};
const bulkBtn = {
  padding: '5px 10px', fontSize: 11,
  background: 'transparent', color: '#aaa',
  border: '1px solid #2a2a2a', borderRadius: 4,
  cursor: 'pointer',
};
const btnPrimary = {
  padding: '10px 16px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 5,
};
const btnGhost = {
  padding: '9px 14px', fontSize: 12,
  background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
