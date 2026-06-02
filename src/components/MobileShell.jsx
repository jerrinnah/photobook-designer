import { useState, useEffect } from 'react';
import { useBookStore } from '../store/useBookStore';
import { SPREAD_SIZES } from '../layouts/spreadSizes';
import { exportCurrentSpread, exportToFolder, exportAsPDF } from '../utils/export';
import { getStoredUser, trackEvent } from '../utils/supabase';
import { subscribeAutosaveStatus } from '../store/autosave';
import PhotoPanel from './PhotoPanel';
import LayoutPicker from './LayoutPicker';
import SpreadNav from './SpreadNav';
import SpreadCanvas from './SpreadCanvas';
import PreviewMode from './PreviewMode';
import PrintPreview from './PrintPreview';
import MobileBottomSheet from './MobileBottomSheet';
import SignupModal from './SignupModal';
import ExportOverlay from './ExportOverlay';

const TABS = [
  { id: 'photos',  label: 'Photos',  icon: '🖼' },
  { id: 'layouts', label: 'Layouts', icon: '▦' },
  { id: 'spreads', label: 'Spreads', icon: '📖' },
  { id: 'menu',    label: 'More',    icon: '⋯' },
];

export default function MobileShell({ stageRef }) {
  const {
    bookName, setBookName,
    spreads, activeSpreadId,
    past, future, undo, redo,
    spreadSizeId, setSpreadSize, customSize,
    autoArrange, autoDesignAll, reshuffleSpread, redesignSpread,
    saveProject, dedupePhotos, repeatedPhotoIds, setRepeatedPhotoIds, resetProject,
  } = useBookStore();

  const [activeSheet, setActiveSheet] = useState(null);  // null | 'photos' | 'layouts' | 'spreads' | 'menu'
  const [previewing, setPreviewing] = useState(false);
  const [printPreviewing, setPrintPreviewing] = useState(false);
  const [signup, setSignup] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [autosave, setAutosave] = useState({ status: 'idle' });
  const [showDesktopBanner, setShowDesktopBanner] = useState(() =>
    !sessionStorage.getItem('mobile-banner-dismissed')
  );

  useEffect(() => subscribeAutosaveStatus((status, meta) => setAutosave({ status, meta })), []);

  const dismissBanner = () => {
    sessionStorage.setItem('mobile-banner-dismissed', '1');
    setShowDesktopBanner(false);
  };

  // Gate Save/Export with signup
  const withSignupGate = (action, fn) => () => {
    const user = getStoredUser();
    const proceed = async () => {
      trackEvent('photobook_export');
      await fn();
    };
    if (user) proceed();
    else setSignup({ action, onComplete: () => { setSignup(null); proceed(); } });
  };

  const doExportAll = async () => {
    setExporting(true);
    await exportToFolder(stageRef, spreads, activeSpreadId, useBookStore.getState().setActiveSpread, spreadSizeId, customSize, bookName);
    setExporting(false);
  };
  const handleExportAll = withSignupGate('export', doExportAll);

  const doExportPDF = async () => {
    setExportingPDF(true);
    await exportAsPDF(stageRef, spreads, activeSpreadId, useBookStore.getState().setActiveSpread, spreadSizeId, customSize, bookName);
    setExportingPDF(false);
  };
  const handleExportPDF = withSignupGate('export', doExportPDF);

  const handleSave = withSignupGate('save', saveProject);

  const handleExportSpread = withSignupGate('export', async () => {
    setExporting(true);
    try {
      await exportCurrentSpread(stageRef, activeSpreadId, spreadSizeId, customSize, bookName);
    } finally {
      setExporting(false);
    }
  });

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

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh',
      background: '#0d0d0d', color: '#e0e0e0',
      overflow: 'hidden',
    }}>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div className="safe-top" style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        background: '#0c0c0c',
        borderBottom: '1px solid #1a1a1a',
      }}>
        <img src="./logo.png" alt="NEJ" style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }} />
        <input
          value={bookName}
          onChange={(e) => setBookName(e.target.value.trim() || 'photobook')}
          style={{
            flex: 1, minWidth: 0,
            background: '#181818', border: '1px solid #252525',
            borderRadius: 5, color: '#ddd', fontSize: 13, fontWeight: 600,
            padding: '6px 10px', outline: 'none',
          }}
        />
        {/* Undo / Redo (compact) */}
        <button onClick={undo} disabled={past.length === 0} style={topBtn(past.length === 0)} aria-label="Undo">↩</button>
        <button onClick={redo} disabled={future.length === 0} style={topBtn(future.length === 0)} aria-label="Redo">↪</button>
      </div>

      {/* Subtle © badge — visible attribution */}
      <div style={{
        fontSize: 9, color: '#2a2a2a', textAlign: 'center',
        padding: '2px 0', background: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a', flexShrink: 0,
        letterSpacing: 0.5,
      }}>
        © NEJ · AutoBook v1.0.0
      </div>

      {/* Desktop banner */}
      {showDesktopBanner && (
        <div style={{
          flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: '#1a1408',
          borderBottom: '1px solid #3a2a10',
          fontSize: 11, color: '#f6c90e',
        }}>
          <span style={{ flex: 1 }}>For precise editing, open this on a desktop.</span>
          <button onClick={dismissBanner} style={{
            background: 'none', border: 'none', color: '#a07a30',
            fontSize: 14, cursor: 'pointer', padding: 0,
          }}>✕</button>
        </div>
      )}

      {/* Autosave status (subtle) */}
      {autosave.status === 'saving' && (
        <div style={statusBarStyle('#888')}>⋯ Saving…</div>
      )}
      {autosave.status === 'too-large' && (
        <div style={statusBarStyle('#f6c90e')}>⚠ Photos too large to autosave fully</div>
      )}

      {/* ── Canvas ──────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#181818', minHeight: 0 }}>
        <SpreadCanvas stageRef={stageRef} mobile />
      </main>

      {/* ── Bottom tab bar ─────────────────────────────────────── */}
      <div className="safe-bottom" style={{
        flexShrink: 0,
        display: 'flex',
        background: '#0c0c0c',
        borderTop: '1px solid #1a1a1a',
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSheet(tab.id)}
            style={{
              flex: 1,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              padding: '8px 0',
              background: 'none', border: 'none',
              color: activeSheet === tab.id ? '#4f8ef7' : '#666',
              fontSize: 10, cursor: 'pointer',
              minHeight: 50,
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Bottom sheets ───────────────────────────────────────── */}
      <MobileBottomSheet open={activeSheet === 'photos'} onClose={() => setActiveSheet(null)} title="Photos" height="80vh">
        <div style={{ height: '100%' }}>
          <PhotoPanel mobile />
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet open={activeSheet === 'layouts'} onClose={() => setActiveSheet(null)} title="Layouts" height="80vh">
        <div style={{ height: '100%' }}>
          <LayoutPicker mobile />
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet open={activeSheet === 'spreads'} onClose={() => setActiveSheet(null)} title="Spreads" height="80vh">
        <div style={{ height: '100%' }}>
          <SpreadNav mobile />
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet open={activeSheet === 'menu'} onClose={() => setActiveSheet(null)} title="Menu" height="70vh">
        <div style={{ padding: '8px 14px 24px' }}>
          {/* Canvas size */}
          <div style={menuSectionStyle}>Canvas size</div>
          <select
            value={spreadSizeId}
            onChange={(e) => setSpreadSize(e.target.value)}
            style={{
              width: '100%', background: '#181818', border: '1px solid #252525',
              borderRadius: 5, color: '#ccc', fontSize: 13, padding: '10px 12px',
              outline: 'none', marginBottom: 16,
            }}
          >
            {['Square', 'Landscape', 'Portrait', 'Panoramic', 'Custom'].map((g) => {
              const items = SPREAD_SIZES.filter((s) => s.group === g);
              if (!items.length) return null;
              return (
                <optgroup key={g} label={g}>
                  {items.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </optgroup>
              );
            })}
          </select>

          {/* Design actions */}
          <div style={menuSectionStyle}>Design</div>
          <div style={menuGridStyle}>
            <MenuBtn onClick={() => { autoArrange(activeSpreadId); setActiveSheet(null); }}>⟐ Arrange</MenuBtn>
            <MenuBtn onClick={() => { redesignSpread(activeSpreadId); setActiveSheet(null); }}>⟳ Redesign</MenuBtn>
            <MenuBtn onClick={() => { autoDesignAll(); setActiveSheet(null); }}>⚡ Design All</MenuBtn>
            <MenuBtn onClick={() => { reshuffleSpread(activeSpreadId); setActiveSheet(null); }}>⇄ Reshuffle</MenuBtn>
            <MenuBtn onClick={handleRepeated} highlight={repeatedPhotoIds.size > 0}>
              {repeatedPhotoIds.size > 0 ? `⚠ ${repeatedPhotoIds.size} Repeated` : '⚠ Find Repeats'}
            </MenuBtn>
            {repeatedPhotoIds.size > 0 && (
              <MenuBtn onClick={() => { dedupePhotos(); setActiveSheet(null); }}>✓ Auto-Fix</MenuBtn>
            )}
          </div>

          {/* View */}
          <div style={menuSectionStyle}>View</div>
          <div style={menuGridStyle}>
            <MenuBtn onClick={() => { setPreviewing(true); setActiveSheet(null); }}>▶ Preview</MenuBtn>
            <MenuBtn onClick={() => { setPrintPreviewing(true); setActiveSheet(null); }}>⬡ Print Specs</MenuBtn>
          </div>

          {/* Save / Export */}
          <div style={menuSectionStyle}>Save & Export</div>
          <div style={menuGridStyle}>
            <MenuBtn onClick={() => { handleSave(); setActiveSheet(null); }} variant="primary">↓ Save</MenuBtn>
            <MenuBtn onClick={() => { handleExportSpread(); setActiveSheet(null); }}>↓ Spread JPG</MenuBtn>
            <MenuBtn onClick={() => { handleExportAll(); setActiveSheet(null); }} variant="primary" disabled={exporting}>
              {exporting ? 'Exporting…' : '↓ All JPGs'}
            </MenuBtn>
            <MenuBtn onClick={() => { handleExportPDF(); setActiveSheet(null); }} variant="warm" disabled={exportingPDF}>
              {exportingPDF ? 'Preparing…' : '↓ PDF'}
            </MenuBtn>
          </div>

          {/* Reset */}
          <div style={menuSectionStyle}>Project</div>
          <div style={menuGridStyle}>
            <MenuBtn onClick={() => {
              if (confirm('Start a new project? Current work will be cleared.')) {
                resetProject();
                setActiveSheet(null);
              }
            }}>+ New Project</MenuBtn>
          </div>
        </div>
      </MobileBottomSheet>

      {/* Modals */}
      {previewing && <PreviewMode onClose={() => setPreviewing(false)} mobile />}
      {printPreviewing && <PrintPreview onClose={() => setPrintPreviewing(false)} mobile />}
      <SignupModal
        open={Boolean(signup)}
        action={signup?.action}
        onClose={() => setSignup(null)}
        onComplete={signup?.onComplete}
      />
      <ExportOverlay
        open={exporting || exportingPDF}
        mode={exportingPDF ? 'pdf' : 'jpg'}
      />
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────
const topBtn = (disabled) => ({
  flexShrink: 0,
  width: 36, height: 32,
  background: '#181818', border: '1px solid #252525',
  borderRadius: 5, color: '#888', fontSize: 14,
  cursor: disabled ? 'default' : 'pointer',
  opacity: disabled ? 0.35 : 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
});

const statusBarStyle = (color) => ({
  flexShrink: 0,
  fontSize: 10, color, padding: '4px 12px',
  background: '#0a0a0a', borderBottom: '1px solid #1a1a1a',
  textAlign: 'center',
});

const menuSectionStyle = {
  fontSize: 10, color: '#555', letterSpacing: 1, textTransform: 'uppercase',
  margin: '8px 0 8px', fontWeight: 600,
};

const menuGridStyle = {
  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
  gap: 8, marginBottom: 8,
};

function MenuBtn({ onClick, children, variant, highlight, disabled }) {
  const colors = {
    default: { bg: '#181818', border: '#252525', color: '#bbb' },
    primary: { bg: '#1a3580', border: '#1a3580', color: '#fff' },
    warm:    { bg: '#2a1a10', border: '#3a2a1a', color: '#d4843a' },
  };
  const c = colors[variant] || colors.default;
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '12px 8px',
      background: highlight ? '#2a0808' : c.bg,
      border: `1px solid ${highlight ? '#5a1a1a' : c.border}`,
      borderRadius: 6,
      color: highlight ? '#e05c5c' : c.color,
      fontSize: 12, fontWeight: 500,
      cursor: disabled ? 'wait' : 'pointer',
      opacity: disabled ? 0.6 : 1,
      textAlign: 'center', lineHeight: 1.2,
      minHeight: 44,
    }}>{children}</button>
  );
}
