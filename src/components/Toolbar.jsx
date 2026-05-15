import { useState, useEffect, useRef } from 'react';
import { useBookStore } from '../store/useBookStore';
import { SPREAD_SIZES } from '../layouts/spreadSizes';
import { exportCurrentSpread, exportToFolder, exportAsPDF } from '../utils/export';
import { subscribeAutosaveStatus } from '../store/autosave';
import { getStoredUser, trackEvent } from '../utils/supabase';
import SignupModal from './SignupModal';

const btnStyle = (extra = {}) => ({
  padding: '5px 11px',
  border: '1px solid #252525',
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  background: '#181818',
  color: '#888',
  whiteSpace: 'nowrap',
  lineHeight: 1,
  ...extra,
});

const inputStyle = {
  background: '#181818',
  border: '1px solid #252525',
  borderRadius: 4,
  color: '#999',
  fontSize: 11,
  padding: '4px 7px',
  outline: 'none',
};

const Divider = () => (
  <div style={{ width: 1, height: 20, background: '#222', margin: '0 2px', flexShrink: 0 }} />
);

export default function Toolbar({ stageRef, onPreview, onPrintPreview }) {
  const {
    spreads, activeSpreadId, setActiveSpread,
    spreadSizeId, setSpreadSize,
    customSize, setCustomSize,
    blendEdges, setBlendEdges,
    autoArrange, autoDesignAll, reshuffleAll, redesignSpread,
    bookName, setBookName,
    gap, setGap,
    past, future, undo, redo,
    saveProject, loadProject,
    repeatedPhotoIds, setRepeatedPhotoIds, dedupePhotos,
    resetProject,
  } = useBookStore();

  const [exporting, setExporting] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [arranged, setArranged] = useState(false);
  const [designed, setDesigned] = useState(false);
  const [reshuffled, setReshuffled] = useState(false);
  const [redesigned, setRedesigned] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState({ status: 'idle', meta: null });
  const [signup, setSignup] = useState(null); // { action: 'save'|'export', onComplete: fn } | null
  const fileInputRef = useRef(null);

  useEffect(() => subscribeAutosaveStatus((status, meta) =>
    setAutosaveStatus({ status, meta })
  ), []);

  const handleNew = () => {
    if (confirm('Start a new project? Current autosaved work will be cleared.')) {
      resetProject();
    }
  };

  // Soft gate: if no stored user yet, show signup before running the action.
  // After signup (or skip), proceed and track the event.
  const withSignupGate = (action, fn) => () => {
    const user = getStoredUser();
    const proceed = async () => {
      if (action === 'export' || action === 'save') trackEvent('photobook_export');
      await fn();
    };
    if (user) {
      proceed();
    } else {
      setSignup({
        action,
        onComplete: () => { setSignup(null); proceed(); },
      });
    }
  };

  // Keyboard undo / redo
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if (e.key === 'z' && e.shiftKey)  { e.preventDefault(); redo(); }
      if (e.key === 'y')                { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const handleAutoArrange = () => {
    autoArrange(activeSpreadId);
    setArranged(true);
    setTimeout(() => setArranged(false), 1400);
  };

  const handleAutoDesignAll = () => {
    autoDesignAll();
    setDesigned(true);
    setTimeout(() => setDesigned(false), 1800);
  };

  const handleReshuffle = () => {
    reshuffleAll();
    setReshuffled(true);
    setTimeout(() => setReshuffled(false), 1400);
  };

  const handleRedesign = () => {
    redesignSpread(activeSpreadId);
    setRedesigned(true);
    setTimeout(() => setRedesigned(false), 1600);
  };

  const handleRepeated = () => {
    if (repeatedPhotoIds.size > 0) {
      setRepeatedPhotoIds(new Set());
      return;
    }
    const counts = {};
    spreads.forEach((sp) => sp.cells.forEach((c) => {
      if (c.photoId != null) counts[c.photoId] = (counts[c.photoId] || 0) + 1;
    }));
    const ids = new Set(Object.keys(counts).filter((id) => counts[id] > 1).map(Number));
    setRepeatedPhotoIds(ids);
  };

  const handleExportCurrent = () =>
    exportCurrentSpread(stageRef, activeSpreadId, spreadSizeId, customSize, bookName);

  const doExportAll = async () => {
    setExporting(true);
    await exportToFolder(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
    setExporting(false);
  };
  const handleExportAll = withSignupGate('export', doExportAll);

  const doExportPDF = async () => {
    setExportingPDF(true);
    await exportAsPDF(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
    setExportingPDF(false);
  };
  const handleExportPDF = withSignupGate('export', doExportPDF);

  const handleSaveGated = withSignupGate('save', saveProject);

  const handleLoadProject = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadProject(ev.target.result);
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <header style={{
      height: 44,
      background: '#0c0c0c',
      borderBottom: '1px solid #1a1a1a',
      display: 'flex',
      alignItems: 'center',
      padding: '0 10px',
      gap: 5,
      flexShrink: 0,
      overflowX: 'auto',
      overflowY: 'hidden',
    }}>
      {/* Studio logo */}
      <img
        src="./logo.png"
        alt="NEJ"
        style={{ height: 30, width: 30, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
      />

      {/* Book name */}
      <input
        value={bookName}
        onChange={(e) => setBookName(e.target.value.trim() || 'photobook')}
        style={{ ...inputStyle, width: 100, fontWeight: 600, color: '#ccc', fontSize: 12, flexShrink: 0 }}
        title="Book name (used in export filenames)"
      />

      <Divider />

      {/* Undo / Redo */}
      <button onClick={undo} disabled={past.length === 0}
        style={btnStyle({ opacity: past.length === 0 ? 0.3 : 1, padding: '5px 8px' })}
        title="Undo (⌘Z)">↩</button>
      <button onClick={redo} disabled={future.length === 0}
        style={btnStyle({ opacity: future.length === 0 ? 0.3 : 1, padding: '5px 8px' })}
        title="Redo (⌘⇧Z)">↪</button>

      <Divider />

      {/* Canvas size */}
      <select
        value={spreadSizeId}
        onChange={(e) => setSpreadSize(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer', flexShrink: 0, maxWidth: 240 }}
        title="Photobook spread size (two pages side by side, 300 DPI print-ready)"
      >
        {['Square', 'Landscape', 'Portrait', 'Panoramic', 'Custom'].map((groupName) => {
          const items = SPREAD_SIZES.filter((s) => s.group === groupName);
          if (items.length === 0) return null;
          return (
            <optgroup key={groupName} label={groupName}>
              {items.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </optgroup>
          );
        })}
      </select>

      {/* Custom size inputs */}
      {spreadSizeId === 'custom' && (
        <>
          <input type="number" value={customSize.w} min={400} max={8000} step={10}
            onChange={(e) => setCustomSize({ ...customSize, w: Math.max(400, parseInt(e.target.value) || 1920) })}
            style={{ ...inputStyle, width: 58 }} title="Export width (px)" />
          <span style={{ color: '#333', fontSize: 11 }}>×</span>
          <input type="number" value={customSize.h} min={400} max={8000} step={10}
            onChange={(e) => setCustomSize({ ...customSize, h: Math.max(400, parseInt(e.target.value) || 1080) })}
            style={{ ...inputStyle, width: 58 }} title="Export height (px)" />
        </>
      )}

      <Divider />

      {/* Gap control */}
      <span style={{ fontSize: 10, color: '#444', flexShrink: 0 }}>Gap</span>
      <input type="range" min={0} max={20} step={1} value={gap}
        onChange={(e) => setGap(Number(e.target.value))}
        style={{ width: 54, flexShrink: 0, accentColor: '#4f8ef7' }}
        title={`Cell gap: ${gap}px`}
      />
      <span style={{ fontSize: 10, color: '#444', minWidth: 16, flexShrink: 0 }}>{gap}</span>

      <Divider />

      {/* Redesign current spread with a new high-density template */}
      <button onClick={handleRedesign}
        style={btnStyle({
          background: redesigned ? '#1a1230' : '#181818',
          color: redesigned ? '#c084fc' : '#888',
          border: `1px solid ${redesigned ? '#4a2a70' : '#252525'}`,
        })}
        title="Pick a new high-density template for this spread and fill it with photos">
        {redesigned ? '✓ Redesigned' : '⟳ Redesign'}
      </button>

      {/* Auto arrange (current spread) */}
      <button onClick={handleAutoArrange}
        style={btnStyle({
          background: arranged ? '#162616' : '#181818',
          color: arranged ? '#6fcf97' : '#888',
          border: `1px solid ${arranged ? '#2a4a2a' : '#252525'}`,
        })}>
        {arranged ? '✓ Done' : '⟐ Arrange'}
      </button>

      {/* Auto design all */}
      <button onClick={handleAutoDesignAll}
        style={btnStyle({
          background: designed ? '#1a1230' : '#181818',
          color: designed ? '#b89fff' : '#888',
          border: `1px solid ${designed ? '#352260' : '#252525'}`,
        })}
        title="Fill all spreads. Auto-adds spreads if needed.">
        {designed ? '✓ Designed' : '⚡ Design All'}
      </button>

      {/* Reshuffle */}
      <button onClick={handleReshuffle}
        style={btnStyle({
          background: reshuffled ? '#1a2a1a' : '#181818',
          color: reshuffled ? '#6fcf97' : '#888',
          border: `1px solid ${reshuffled ? '#2a4a2a' : '#252525'}`,
        })}
        title="Randomly reshuffle photo assignments">
        {reshuffled ? '✓ Shuffled' : '⇄ Reshuffle'}
      </button>

      {/* Repeated photos — click to highlight, click again to auto-fix */}
      <button onClick={handleRepeated}
        style={btnStyle({
          background: repeatedPhotoIds.size > 0 ? '#2a0808' : '#181818',
          color: repeatedPhotoIds.size > 0 ? '#e05c5c' : '#888',
          border: `1px solid ${repeatedPhotoIds.size > 0 ? '#5a1a1a' : '#252525'}`,
        })}
        title={repeatedPhotoIds.size > 0 ? 'Clear highlight' : 'Highlight photos used in multiple cells'}>
        {repeatedPhotoIds.size > 0 ? `⚠ ${repeatedPhotoIds.size} Repeated` : '⚠ Repeated'}
      </button>
      {repeatedPhotoIds.size > 0 && (
        <button onClick={dedupePhotos}
          style={btnStyle({
            background: '#2a1a08', color: '#f6c90e', border: '1px solid #5a3a10',
          })}
          title="Auto-fix: keep first use of each photo, clear duplicates">
          ✓ Fix
        </button>
      )}

      {/* Blend edges */}
      <button onClick={() => setBlendEdges(!blendEdges)}
        title="Fade photo edges for a soft, editorial look"
        style={btnStyle({
          background: blendEdges ? '#1a1230' : '#181818',
          color: blendEdges ? '#b89fff' : '#555',
          border: `1px solid ${blendEdges ? '#352260' : '#252525'}`,
        })}>
        ◈ Blend {blendEdges ? 'On' : 'Off'}
      </button>

      <div style={{ flex: 1, minWidth: 4 }} />

      {/* Autosave status */}
      <AutosaveBadge status={autosaveStatus.status} meta={autosaveStatus.meta} />

      <span style={{ fontSize: 10, color: '#333', flexShrink: 0 }}>
        {spreads.length} spread{spreads.length !== 1 ? 's' : ''}
      </span>

      {/* Preview */}
      <button onClick={onPreview}
        style={btnStyle({ color: '#aaa', border: '1px solid #2a2a2a' })}
        title="Full-screen book preview">
        ▶ Preview
      </button>

      <button onClick={onPrintPreview}
        style={btnStyle({ color: '#d4843a', border: '1px solid #3a2a1a', background: '#181008' })}
        title="Print preview with CMYK simulation and DPI specs">
        ⬡ Print
      </button>

      <Divider />

      {/* New project (clears autosave) */}
      <button onClick={handleNew}
        style={btnStyle({ color: '#888', border: '1px solid #2a2a2a' })}
        title="Start a new blank project (clears autosaved work)">
        + New
      </button>

      {/* Save / Load project */}
      <button onClick={handleSaveGated}
        style={btnStyle({ color: '#6a9fd8', border: '1px solid #1e2d45', background: '#0e1620' })}
        title="Save project as .photobook file">
        ↓ Save
      </button>
      <button onClick={() => fileInputRef.current?.click()}
        style={btnStyle({ color: '#6a9fd8', border: '1px solid #1e2d45', background: '#0e1620' })}
        title="Load a .photobook project file">
        ↑ Load
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".photobook,application/json"
        style={{ display: 'none' }}
        onChange={handleLoadProject}
      />

      <Divider />

      {/* Export */}
      <button onClick={handleExportCurrent}
        style={btnStyle({ color: '#6a9fd8', border: '1px solid #1e2d45', background: '#0e1620' })}>
        Export Spread
      </button>

      <button onClick={handleExportAll} disabled={exporting}
        style={{
          ...btnStyle({ background: '#1a3580', color: '#fff', border: 'none' }),
          opacity: exporting ? 0.65 : 1,
          cursor: exporting ? 'wait' : 'pointer',
        }}
        title="Choose a folder — all spreads are saved as numbered JPGs">
        {exporting ? 'Exporting…' : '↓ Export All JPGs'}
      </button>

      <button onClick={handleExportPDF} disabled={exportingPDF}
        style={{
          ...btnStyle({ background: '#2a1a10', color: '#d4843a', border: '1px solid #3a2a1a' }),
          opacity: exportingPDF ? 0.65 : 1,
          cursor: exportingPDF ? 'wait' : 'pointer',
        }}
        title="Export all spreads as print-ready PDF (opens browser print dialog)">
        {exportingPDF ? 'Preparing…' : 'Print PDF'}
      </button>

      <SignupModal
        open={Boolean(signup)}
        action={signup?.action}
        onClose={() => setSignup(null)}
        onComplete={signup?.onComplete}
      />
    </header>
  );
}

function AutosaveBadge({ status, meta }) {
  const map = {
    idle:        { label: '',                color: '#333',   bg: 'transparent' },
    saving:      { label: '⋯ Saving',        color: '#888',   bg: '#181818' },
    saved:       { label: '✓ Saved',         color: '#6fcf97', bg: '#0e1a10' },
    'too-large': { label: '⚠ Layout saved (photos too large)', color: '#f6c90e', bg: '#1a1408' },
    error:       { label: '⚠ Autosave failed', color: '#e05c5c', bg: '#1a0808' },
  };
  const s = map[status] || map.idle;
  if (!s.label) return null;
  const tooltip = meta?.savedAt
    ? `Autosaved ${new Date(meta.savedAt).toLocaleTimeString()} · ${(meta.bytes / 1024).toFixed(0)} KB`
    : status === 'too-large'
      ? 'Photos exceeded 4.5 MB — only layout was autosaved. Use ↓ Save to keep a full backup.'
      : '';
  return (
    <span
      title={tooltip}
      style={{
        fontSize: 10, color: s.color, background: s.bg,
        padding: '3px 8px', borderRadius: 4,
        border: s.bg === 'transparent' ? 'none' : '1px solid #252525',
        flexShrink: 0, whiteSpace: 'nowrap',
      }}
    >{s.label}</span>
  );
}
