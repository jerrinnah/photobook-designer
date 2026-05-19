import { useState, useEffect } from 'react';
import { useBookStore } from '../store/useBookStore';
import { SPREAD_SIZES } from '../layouts/spreadSizes';
import { exportToFolder, exportAsPDF } from '../utils/export';
import { subscribeAutosaveStatus } from '../store/autosave';
import { getStoredUser, trackEvent, signOut, onAuthStateChange } from '../utils/supabase';
import { isProjectUnlocked } from '../utils/paystack';
import { getActiveProjectId } from '../store/projects';
import { getEffectiveTier, trialStatus, starterStatus } from '../utils/premium';
import AuthModal from './AuthModal';
import ProjectPicker from './ProjectPicker';
import BrandingSettings from './BrandingSettings';
import ShareModal from './ShareModal';
import SetPasswordModal from './SetPasswordModal';
import UpgradeModal from './UpgradeModal';

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
    autoArrange, autoDesignAll, reshuffleSpread, redesignSpread,
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
  const [signup, setSignup] = useState(null); // { action: 'save'|'export' } | null
  const [showProjects, setShowProjects] = useState(false);
  const [showBrand, setShowBrand] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [authUser, setAuthUser] = useState(getStoredUser());
  const [profileOpen, setProfileOpen] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const brand = authUser?.brand || {};

  useEffect(() => subscribeAutosaveStatus((status, meta) =>
    setAutosaveStatus({ status, meta })
  ), []);

  // Re-render whenever the Supabase auth state changes (sign-in via magic
  // link, sign-out, token refresh)
  useEffect(() => onAuthStateChange((profile) => {
    setAuthUser(profile || null);
    if (profile) setSignup(null); // close any open auth modal once signed in
  }), []);

  const handleSignOut = async () => {
    await signOut();
    setAuthUser(null);
    setProfileOpen(false);
  };

  const handleNew = () => {
    if (confirm('Start a new project? Current autosaved work will be cleared.')) {
      resetProject();
    }
  };

  // Soft gate: if no stored user yet, show the magic-link sign-in modal.
  // Once the user clicks the link in their email and returns, they're
  // signed in automatically — they just have to click Save / Export again.
  // 'save' actions: just require sign-in. No tier or quota check.
  // 'export' actions: also require Pro/Starter/Trial tier OR a per-book
  // unlock for the current project. Free-tier users (post-trial) get
  // prompted to upgrade or pay for THIS book at the per-spread rate.
  const withSignupGate = (action, fn) => async () => {
    const user = getStoredUser();
    if (!user) { setSignup({ action }); return; }
    if (action !== 'export') { await fn(); return; }

    // Export path: tier or per-book unlock required
    const tier = getEffectiveTier(user);
    if (tier === 'pro' || tier === 'starter' || tier === 'trial') {
      trackEvent('photobook_export');
      await fn();
      return;
    }
    // Free tier — check whether this book has been paid for already
    const projectId = getActiveProjectId();
    if (projectId && (await isProjectUnlocked(projectId))) {
      trackEvent('photobook_export');
      await fn();
      return;
    }
    // Block — show upgrade / per-book payment options
    setShowUpgrade(true);
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
    reshuffleSpread(activeSpreadId);
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
      {/* Studio logo — overridden by user's brand logo if premium has set one */}
      <img
        src={brand.logoUrl || './logo.png'}
        alt={brand.name || 'NEJ'}
        title={brand.name ? `${brand.name} — click to edit brand` : 'Brand settings (Premium)'}
        onClick={() => setShowBrand(true)}
        onError={(e) => { e.currentTarget.src = './logo.png'; }}
        style={{
          height: 30, width: 30, objectFit: 'contain', borderRadius: '50%',
          flexShrink: 0, cursor: 'pointer',
          background: '#181818',
        }}
      />

      {/* Book name */}
      <input
        data-tour="book-name"
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
      <button data-tour="redesign" onClick={handleRedesign}
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
      <button data-tour="design-all" onClick={handleAutoDesignAll}
        style={btnStyle({
          background: designed ? '#1a1230' : '#181818',
          color: designed ? '#b89fff' : '#888',
          border: `1px solid ${designed ? '#352260' : '#252525'}`,
        })}
        title="Fill all spreads. Auto-adds spreads if needed.">
        {designed ? '✓ Designed' : '⚡ Design All'}
      </button>

      {/* Reshuffle */}
      <button data-tour="reshuffle" onClick={handleReshuffle}
        style={btnStyle({
          background: reshuffled ? '#1a2a1a' : '#181818',
          color: reshuffled ? '#6fcf97' : '#888',
          border: `1px solid ${reshuffled ? '#2a4a2a' : '#252525'}`,
        })}
        title="Reshuffle current spread — fills empty cells with the next unplaced photos, otherwise shuffles photos already on this spread">
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

      {/* Profile / sign-in */}
      {authUser?.email ? (() => {
        const eff = getEffectiveTier(authUser);
        const trial = trialStatus(authUser);
        const starter = starterStatus(authUser);
        const avatarBg = eff === 'pro' ? '#3a2a08' : eff === 'starter' ? '#0e2a3a' : eff === 'trial' ? '#1a3a2a' : '#1a3580';
        const avatarColor = eff === 'pro' ? '#f6c90e' : eff === 'starter' ? '#6fb8d8' : eff === 'trial' ? '#6fcf97' : '#fff';
        const displayName = authUser.email.split('@')[0];
        return (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            data-tour="profile"
            onClick={() => setProfileOpen((v) => !v)}
            style={{
              ...btnStyle({ padding: '4px 10px' }),
              display: 'flex', alignItems: 'center', gap: 7,
              maxWidth: 240,
            }}
            title={
              eff === 'pro' ? `${authUser.email} · Pro (unlimited)` :
              eff === 'starter' ? `${authUser.email} · Starter · ${starter.remaining}/${starter.quota} exports left` :
              eff === 'trial' ? `${authUser.email} · Trial · ${trial.exportsLeft} export${trial.exportsLeft === 1 ? '' : 's'} left` :
              `${authUser.email} · Free`
            }
          >
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              background: avatarBg, color: avatarColor,
              fontSize: 10, fontWeight: 700, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span style={{
              fontSize: 11, color: '#ccc', fontWeight: 500,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: 180,
            }}>
              {displayName}
            </span>
            {eff === 'pro' && <span style={{ fontSize: 8, color: '#f6c90e', letterSpacing: 0.5, flexShrink: 0 }}>PRO</span>}
            {eff === 'starter' && <span style={{ fontSize: 8, color: '#6fb8d8', letterSpacing: 0.5, flexShrink: 0 }}>STARTER</span>}
            {eff === 'trial' && <span style={{ fontSize: 8, color: '#6fcf97', letterSpacing: 0.5, flexShrink: 0 }}>TRIAL</span>}
          </button>
          {profileOpen && (
            <>
              <div
                onClick={() => setProfileOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}
              />
              <div style={{
                position: 'fixed', right: 10, top: 48,
                zIndex: 31,
                background: '#0e0e0e', border: '1px solid #1f1f1f',
                borderRadius: 6, padding: 6, minWidth: 220,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              }}>
                <div style={{ padding: '8px 10px', fontSize: 10, color: '#555' }}>
                  Signed in as
                  <div style={{ color: '#ddd', fontSize: 12, marginTop: 2, fontWeight: 500 }}>
                    {authUser.email}
                  </div>
                  {eff === 'pro' && (
                    <div style={{ color: '#f6c90e', fontSize: 9, marginTop: 4, letterSpacing: 0.5 }}>
                      ✦ PRO · unlimited
                    </div>
                  )}
                  {eff === 'starter' && starter && (
                    <div style={{ marginTop: 6, padding: '6px 8px', background: '#0e1a26', border: '1px solid #2a4a6a', borderRadius: 4 }}>
                      <div style={{ color: '#6fb8d8', fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>
                        STARTER
                      </div>
                      <div style={{ color: '#aaa', fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>
                        {starter.remaining} of {starter.quota} export{starter.quota === 1 ? '' : 's'} left
                      </div>
                    </div>
                  )}
                  {eff === 'trial' && trial?.isActive && (
                    <div style={{ marginTop: 6, padding: '6px 8px', background: '#0e1a10', border: '1px solid #2a4a2a', borderRadius: 4 }}>
                      <div style={{ color: '#6fcf97', fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>
                        ✦ Trial active
                      </div>
                      <div style={{ color: '#aaa', fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>
                        {trial.exportsLeft} export{trial.exportsLeft === 1 ? '' : 's'} left ·{' '}
                        {trial.daysLeft} day{trial.daysLeft === 1 ? '' : 's'} remaining
                      </div>
                    </div>
                  )}
                  {eff === 'free' && (
                    <div style={{ color: '#888', fontSize: 9, marginTop: 4 }}>
                      Free tier
                    </div>
                  )}
                </div>
                <div style={{ borderTop: '1px solid #1a1a1a', marginTop: 4, paddingTop: 4 }}>
                  <button
                    onClick={() => { setShowBrand(true); setProfileOpen(false); }}
                    style={menuItemStyle}
                  >
                    Brand settings
                  </button>
                  <button
                    onClick={() => { setShowPassword(true); setProfileOpen(false); }}
                    style={menuItemStyle}
                  >
                    Set / change password
                  </button>
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      window.dispatchEvent(new CustomEvent('autobook:start-tour'));
                    }}
                    style={menuItemStyle}
                  >
                    Take the tour
                  </button>
                  <button
                    onClick={handleSignOut}
                    style={{ ...menuItemStyle, color: '#e05c5c' }}
                  >
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        );
      })() : (
        <button
          data-tour="profile"
          onClick={() => setSignup({ action: 'signin' })}
          style={btnStyle({ color: '#aaa', padding: '4px 12px' })}
          title="Sign in or sign up"
        >
          Sign in
        </button>
      )}

      {/* Autosave status */}
      <AutosaveBadge status={autosaveStatus.status} meta={autosaveStatus.meta} />

      {/* Preview */}
      <button data-tour="preview" onClick={onPreview}
        style={btnStyle({ color: '#aaa', border: '1px solid #2a2a2a' })}
        title="Full-screen book preview">
        ▶ Preview
      </button>

      <button onClick={onPrintPreview}
        style={btnStyle({ color: '#d4843a', border: '1px solid #3a2a1a', background: '#181008' })}
        title="Print preview with CMYK simulation and DPI specs">
        ⬡ Print
      </button>

      <button data-tour="share" onClick={() => setShowShare(true)}
        style={btnStyle({ color: '#9fb88b', border: '1px solid #2a3a20', background: '#0e1408' })}
        title="Share a read-only preview link with your client (Premium)">
        ✦ Share
      </button>

      <Divider />

      {/* My Projects — switch / create / duplicate / delete · also holds backup */}
      <button data-tour="projects" onClick={() => setShowProjects(true)}
        style={btnStyle({ color: '#aaa', border: '1px solid #2a2a2a' })}
        title="Switch between projects · create new · duplicate · delete · backup/restore">
        📁 Projects
      </button>

      {/* Export — single button with JPG / PDF options */}
      <div data-tour="export">
        <ExportMenu
          onExportJPGs={handleExportAll}
          onExportPDF={handleExportPDF}
          exporting={exporting}
          exportingPDF={exportingPDF}
        />
      </div>

      <AuthModal
        open={Boolean(signup)}
        action={signup?.action}
        onClose={() => setSignup(null)}
      />
      <ProjectPicker
        open={showProjects}
        onClose={() => setShowProjects(false)}
        onSaveBackup={handleSaveGated}
        onLoadBackup={loadProject}
      />
      <BrandingSettings open={showBrand} onClose={() => setShowBrand(false)} />
      <SetPasswordModal open={showPassword} onClose={() => setShowPassword(false)} />
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} blockedFeature="exporting this book" />
      <ShareModal open={showShare} onClose={() => setShowShare(false)} stageRef={stageRef} />
    </header>
  );
}

// Combined export dropdown — replaces the old Export All JPGs + Print PDF
// pair. Single button, click to open menu with both options.
function ExportMenu({ onExportJPGs, onExportPDF, exporting, exportingPDF }) {
  const [open, setOpen] = useState(false);
  const busy = exporting || exportingPDF;
  const label = exporting ? 'Exporting JPGs…' : exportingPDF ? 'Preparing PDF…' : '↓ Export ▾';
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => !busy && setOpen((v) => !v)}
        disabled={busy}
        style={{
          ...btnStyle({ background: '#1a3580', color: '#fff', border: 'none', padding: '5px 12px' }),
          opacity: busy ? 0.7 : 1,
          cursor: busy ? 'wait' : 'pointer',
          fontWeight: 600,
        }}
        title="Export all spreads — choose JPGs or print-ready PDF"
      >
        {label}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}
          />
          <div style={{
            position: 'fixed', right: 10, top: 48,
            zIndex: 31,
            background: '#0e0e0e', border: '1px solid #1f1f1f',
            borderRadius: 6, padding: 4, minWidth: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          }}>
            <button
              onClick={() => { setOpen(false); onExportJPGs(); }}
              style={exportMenuItem}
              title="All spreads saved as numbered JPGs to a folder"
            >
              <span style={{ color: '#6a9fd8', fontWeight: 600 }}>↓ All JPGs</span>
              <span style={{ fontSize: 9, color: '#555', marginTop: 2 }}>Numbered images, one per spread</span>
            </button>
            <button
              onClick={() => { setOpen(false); onExportPDF(); }}
              style={exportMenuItem}
              title="Print-ready PDF with all spreads"
            >
              <span style={{ color: '#d4843a', fontWeight: 600 }}>⬡ Print PDF</span>
              <span style={{ fontSize: 9, color: '#555', marginTop: 2 }}>Single PDF for print shops</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const exportMenuItem = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  width: '100%', textAlign: 'left',
  padding: '8px 12px',
  background: 'none', border: 'none',
  fontSize: 12, cursor: 'pointer',
  borderRadius: 4,
};

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

const menuItemStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '7px 10px',
  background: 'none',
  border: 'none',
  color: '#bbb',
  fontSize: 11,
  cursor: 'pointer',
  borderRadius: 3,
};
