import { useState, useEffect, useRef, useMemo } from 'react';
import { useBookStore } from '../store/useBookStore';
import { SPREAD_SIZES } from '../layouts/spreadSizes';
import { exportToFolder, exportAsPDF } from '../utils/export';
import { subscribeAutosaveStatus } from '../store/autosave';
import { getStoredUser, trackEvent, signOut, onAuthStateChange, refreshUserTier, supabase } from '../utils/supabase';
import { isProjectUnlocked } from '../utils/paystack';
import { getActiveProjectId } from '../store/projects';
import { getEffectiveTier, trialStatus, starterStatus, priceForProject } from '../utils/premium';
import AuthModal from './AuthModal';
import ProjectPicker from './ProjectPicker';
import BrandingSettings from './BrandingSettings';
import ShareModal from './ShareModal';
import SetPasswordModal from './SetPasswordModal';
import UpgradeModal from './UpgradeModal';
import DesktopAppModal from './DesktopAppModal';
import SupportModal from './SupportModal';
import SpreadExportPicker from './SpreadExportPicker';
import ReferralModal from './ReferralModal';
import ExportOverlay from './ExportOverlay';
import { useTheme } from '../utils/theme';

const makeBtnStyle = (t) => (extra = {}) => ({
  padding: '5px 11px',
  border: `1px solid ${t.border}`,
  borderRadius: 4,
  fontSize: 11,
  cursor: 'pointer',
  background: t.bgInput,
  color: t.textMuted,
  whiteSpace: 'nowrap',
  lineHeight: 1,
  ...extra,
});

const makeInputStyle = (t) => ({
  background: t.bgInput,
  border: `1px solid ${t.border}`,
  borderRadius: 4,
  color: t.textMuted,
  fontSize: 11,
  padding: '4px 7px',
  outline: 'none',
});

const Divider = ({ t }) => (
  <div style={{ width: 1, height: 20, background: t.divider, margin: '0 2px', flexShrink: 0 }} />
);

export default function Toolbar({ stageRef, onPreview, onPrintPreview }) {
  const { t, mode: themeMode, toggle: toggleTheme } = useTheme();
  const btnStyle = makeBtnStyle(t);
  const inputStyle = makeInputStyle(t);
  const menuItem = makeMenuItem(t);
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
  const [showDesktop, setShowDesktop] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showReferral, setShowReferral] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [authUser, setAuthUser] = useState(getStoredUser());
  const [profileOpen, setProfileOpen] = useState(false);
  // On macOS Electron the traffic-light buttons (red/yellow/green) float
  // in the top-left because we use titleBarStyle:'hiddenInset'. Reserve
  // ~80px of left padding so they don't overlap the logo + project name.
  // Web browsers don't need this — title bar lives in the browser chrome.
  const isElectronMac = useMemo(() => {
    if (typeof window === 'undefined' || !window.navigator) return false;
    const ua = window.navigator.userAgent || '';
    const platform = window.navigator.platform || '';
    return /Electron/i.test(ua) && /Mac/i.test(platform || ua);
  }, []);
  // Dynamically track where the toolbar ends so dropdowns anchor below
  // it correctly even when buttons wrap to a second row on narrow screens.
  const headerRef = useRef(null);
  const [headerBottom, setHeaderBottom] = useState(48);
  useEffect(() => {
    const measure = () => {
      if (headerRef.current) {
        setHeaderBottom(Math.round(headerRef.current.getBoundingClientRect().bottom) + 4);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    // Also re-measure when the toolbar's content changes (e.g. a button
    // appears, project name grows). ResizeObserver fires on layout shifts.
    let ro;
    if (typeof ResizeObserver !== 'undefined' && headerRef.current) {
      ro = new ResizeObserver(measure);
      ro.observe(headerRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, []);
  const [upgradeReason, setUpgradeReason] = useState(null); // 'export' | 'plans' | null

  // App.jsx fires this when ?plan=pro / ?plan=starter is in the URL
  // (landing-page Choose Pro / Choose Starter CTA). UpgradeModal then
  // walks the user through signup-then-pay.
  useEffect(() => {
    const onOpen = (e) => {
      // The plan param is forwarded as detail for future use; the modal
      // itself doesn't need it to render — the user picks the plan
      // from the cards inside.
      void e?.detail?.plan;
      setUpgradeReason('plans');
    };
    window.addEventListener('autobook:open-upgrade', onOpen);
    return () => window.removeEventListener('autobook:open-upgrade', onOpen);
  }, []);
  // The export action queued behind a paywall — runs after per-book unlock.
  const pendingExportRef = useRef(null);

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

  // Admin-initiated password resets: when the user clicks the recovery
  // link in their email, Supabase signs them in with a temporary session
  // and fires PASSWORD_RECOVERY. We open the SetPasswordModal so they
  // can immediately type a new password.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setShowPassword(true);
    });
    // Also catch the case where the user arrived with ?reset=1 in the
    // URL (e.g. opened the link in a new tab after the listener ran).
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1') setShowPassword(true);
    } catch { /* ignore */ }
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

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
    if (action !== 'export') return await fn();

    // Export path: tier or per-book unlock required
    const tier = getEffectiveTier(user);
    if (tier === 'pro' || tier === 'starter' || tier === 'trial') {
      // Fire-and-forget telemetry. Awaiting these RPC calls would consume
      // the user-gesture token, so showDirectoryPicker() / a.click() in
      // the actual export would be rejected by the browser. Trial counter
      // still updates within ~1s via cacheListeners.
      trackEvent('photobook_export').catch(() => {});
      Promise.resolve().then(() => refreshUserTier()).catch(() => {});
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
    // Free + not unlocked. If they haven't actually designed anything,
    // upgrade is meaningless — nudge them to design first.
    const price = priceForProject(spreads);
    if (price.totalNGN === 0) {
      alert('Add photos to at least one spread before exporting. (Try Design All to fill every spread in one click.)');
      return;
    }
    // Queue this export so it runs automatically once the user pays for
    // the per-book unlock (no need to click Export again post-payment).
    pendingExportRef.current = fn;
    setUpgradeReason('export');
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
    try {
      await exportToFolder(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
    } finally {
      setExporting(false);
    }
  };
  const handleExportAll = withSignupGate('export', doExportAll);

  const doExportPDF = async () => {
    setExportingPDF(true);
    try {
      await exportAsPDF(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
    } finally {
      setExportingPDF(false);
    }
  };
  const handleExportPDF = withSignupGate('export', doExportPDF);

  // Picker-driven export — opens unconditionally (no paywall gate at
  // open time, since browsing the picker shouldn't burn a trial export
  // or hit a network call). The export action inside the picker is
  // gated via withSignupGate, same as the All-JPGs / Print-PDF paths.
  const [showSpreadPicker, setShowSpreadPicker] = useState(false);
  const openSpreadPicker = () => setShowSpreadPicker(true);
  const handleSpreadPickerExport = async ({ ids, format }) => {
    setShowSpreadPicker(false);
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    const subset = spreads.filter((s) => idSet.has(s.id));
    const fn = format === 'pdf'
      ? async () => {
          setExportingPDF(true);
          try {
            await exportAsPDF(stageRef, subset, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
          } finally {
            setExportingPDF(false);
          }
        }
      : async () => {
          setExporting(true);
          try {
            await exportToFolder(stageRef, subset, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
          } finally {
            setExporting(false);
          }
        };
    await withSignupGate('export', fn)();
  };

  const handleSaveGated = withSignupGate('save', saveProject);

  return (
    <header ref={headerRef} style={{
      minHeight: 44,
      background: t.bgPanel,
      borderBottom: `1px solid ${t.borderHard}`,
      // Subtle drop shadow in light mode adds visual depth between
      // the toolbar and the canvas below. No-op in dark mode where
      // the border already provides enough separation.
      boxShadow: t.mode === 'light' ? '0 1px 0 rgba(15,20,30,0.04), 0 2px 6px rgba(15,20,30,0.04)' : 'none',
      display: 'flex',
      flexWrap: 'wrap',           // wrap to multiple rows on narrow screens
      alignItems: 'center',
      position: 'relative',
      zIndex: 5,
      // Extra left padding on Electron/Mac to clear the traffic-light buttons.
      padding: isElectronMac ? '4px 10px 4px 82px' : '4px 10px',
      gap: 5,
      rowGap: 4,
      flexShrink: 0,
    }}>
      {/* Studio logo — overridden by user's brand logo if premium has set one */}
      <img
        src={brand.logoUrl || './logo.png'}
        alt={brand.name || 'NEJ'}
        title={brand.name ? `${brand.name} — click to edit brand` : 'Brand settings (Premium)'}
        onClick={() => setShowBrand(true)}
        onError={(e) => { e.currentTarget.src = './logo.png'; }}
        style={{
          height: 36, width: 36, objectFit: 'contain',
          // Round-crop only for user-uploaded brand logos (which expect
          // profile-style framing). Default AutoBook logo shows in full.
          borderRadius: brand.logoUrl ? '50%' : 4,
          flexShrink: 0, cursor: 'pointer',
        }}
      />

      {/* Project / book name — single field, single source of truth.
          Edits here rename the active project in the Projects modal. */}
      <input
        data-tour="book-name"
        value={bookName}
        onChange={(e) => setBookName(e.target.value)}
        onBlur={(e) => setBookName(e.target.value.trim() || 'Untitled photobook')}
        style={{ ...inputStyle, width: 140, fontWeight: 600, color: t.textHeading, fontSize: 12, flexShrink: 0 }}
        title="Project name — used in export filenames and shown in the Projects list"
        placeholder="Project name"
      />

      {/* Theme toggle — refined pill, always in the first toolbar row */}
      <button
        onClick={toggleTheme}
        style={{
          padding: '5px 10px',
          border: `1px solid ${t.border}`,
          borderRadius: 999,
          fontSize: 11,
          cursor: 'pointer',
          background: t.bgInput,
          color: t.text,
          whiteSpace: 'nowrap',
          lineHeight: 1,
          fontWeight: 500,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
        title={themeMode === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
      >
        <span style={{ fontSize: 13 }}>{themeMode === 'light' ? '🌙' : '🌞'}</span>
        <span style={{ color: t.textMuted }}>{themeMode === 'light' ? 'Dark' : 'Light'}</span>
      </button>

      <Divider t={t} />

      {/* Undo / Redo */}
      <button onClick={undo} disabled={past.length === 0}
        style={btnStyle({ opacity: past.length === 0 ? 0.3 : 1, padding: '5px 8px' })}
        title="Undo (⌘Z)">↩</button>
      <button onClick={redo} disabled={future.length === 0}
        style={btnStyle({ opacity: future.length === 0 ? 0.3 : 1, padding: '5px 8px' })}
        title="Redo (⌘⇧Z)">↪</button>

      <Divider t={t} />

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
          <span style={{ color: t.textFaint, fontSize: 11 }}>×</span>
          <input type="number" value={customSize.h} min={400} max={8000} step={10}
            onChange={(e) => setCustomSize({ ...customSize, h: Math.max(400, parseInt(e.target.value) || 1080) })}
            style={{ ...inputStyle, width: 58 }} title="Export height (px)" />
        </>
      )}

      <Divider t={t} />

      {/* Redesign current spread with a new high-density template */}
      <button data-tour="redesign" onClick={handleRedesign}
        style={btnStyle({
          background: redesigned ? (t.mode === 'light' ? '#f0e6ff' : '#1a1230') : t.bgInput,
          color: redesigned ? '#7a3fc8' : t.text,
          border: `1px solid ${redesigned ? (t.mode === 'light' ? '#c8a8e8' : '#4a2a70') : t.border}`,
        })}
        title="Pick a new high-density template for this spread and fill it with photos">
        {redesigned ? '✓ Redesigned' : '⟳ Redesign'}
      </button>

      {/* Auto design all — headline action */}
      <button data-tour="design-all" onClick={handleAutoDesignAll}
        style={btnStyle({
          background: designed ? (t.mode === 'light' ? '#f0e6ff' : '#1a1230') : t.bgInput,
          color: designed ? '#7a3fc8' : t.text,
          border: `1px solid ${designed ? (t.mode === 'light' ? '#c8a8e8' : '#352260') : t.border}`,
        })}
        title="Fill all spreads. Auto-adds spreads if needed.">
        {designed ? '✓ Designed' : '⚡ Design All'}
      </button>

      {/* Reshuffle current spread */}
      <button data-tour="reshuffle" onClick={handleReshuffle}
        style={btnStyle({
          background: reshuffled ? (t.mode === 'light' ? '#e6f5ec' : '#1a2a1a') : t.bgInput,
          color: reshuffled ? '#2f9e5f' : t.text,
          border: `1px solid ${reshuffled ? (t.mode === 'light' ? '#a8d8b8' : '#2a4a2a') : t.border}`,
        })}
        title="Reshuffle current spread — fills empty cells with the next unplaced photos, otherwise shuffles photos already on this spread">
        {reshuffled ? '✓ Shuffled' : '⇄ Reshuffle'}
      </button>

      {/* Secondary tools — Arrange, Repeated, Blend, Gap, Print preview */}
      <ToolsMenu
        t={t}
        anchorTop={headerBottom}
        onArrange={handleAutoArrange}
        onRepeated={handleRepeated}
        onDedupe={dedupePhotos}
        onPrintPreview={onPrintPreview}
        repeatedCount={repeatedPhotoIds.size}
        arranged={arranged}
        blendEdges={blendEdges}
        setBlendEdges={setBlendEdges}
        gap={gap}
        setGap={setGap}
      />

      <div style={{ flex: 1, minWidth: 4 }} />

      {/* Profile / sign-in */}
      {authUser?.email ? (() => {
        const eff = getEffectiveTier(authUser);
        const trial = trialStatus(authUser);
        const starter = starterStatus(authUser);
        const avatarBg = eff === 'pro'
          ? (t.mode === 'light' ? '#fdf3c4' : '#3a2a08')
          : eff === 'starter'
            ? (t.mode === 'light' ? '#dcecf5' : '#0e2a3a')
            : eff === 'trial'
              ? (t.mode === 'light' ? '#e3f3e3' : '#1a3a2a')
              : '#1a3580';
        const avatarColor = eff === 'pro'
          ? (t.mode === 'light' ? '#7a5c00' : '#f6c90e')
          : eff === 'starter'
            ? (t.mode === 'light' ? '#2a6580' : '#6fb8d8')
            : eff === 'trial'
              ? (t.mode === 'light' ? '#2f7a4a' : '#6fcf97')
              : '#fff';
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
              fontSize: 11, color: t.textStrong, fontWeight: 500,
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
                position: 'fixed', right: 10, top: headerBottom,
                zIndex: 31,
                background: t.bgMenu, border: `1px solid ${t.borderSoft}`,
                borderRadius: 6, padding: 6, minWidth: 220,
                boxShadow: `0 8px 24px ${t.shadow}`,
              }}>
                <div style={{ padding: '8px 10px', fontSize: 10, color: t.textFaint }}>
                  Signed in as
                  <div style={{ color: t.textStrong, fontSize: 12, marginTop: 2, fontWeight: 500 }}>
                    {authUser.email}
                  </div>
                  {eff === 'pro' && (
                    <div style={{ color: '#f6c90e', fontSize: 9, marginTop: 4, letterSpacing: 0.5 }}>
                      ✦ PRO · unlimited
                    </div>
                  )}
                  {eff === 'starter' && starter && (
                    <div style={{
                      marginTop: 6, padding: '6px 8px',
                      background: t.mode === 'light' ? '#e6f0f7' : '#0e1a26',
                      border: `1px solid ${t.mode === 'light' ? '#a8c8dc' : '#2a4a6a'}`,
                      borderRadius: 4,
                    }}>
                      <div style={{ color: t.mode === 'light' ? '#2a6580' : '#6fb8d8', fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>
                        STARTER
                      </div>
                      <div style={{ color: t.textMuted, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>
                        {starter.remaining} of {starter.quota} export{starter.quota === 1 ? '' : 's'} left
                      </div>
                    </div>
                  )}
                  {eff === 'trial' && trial?.isActive && (
                    <div style={{
                      marginTop: 6, padding: '6px 8px',
                      background: t.mode === 'light' ? '#e6f5ec' : '#0e1a10',
                      border: `1px solid ${t.mode === 'light' ? '#a8d8b8' : '#2a4a2a'}`,
                      borderRadius: 4,
                    }}>
                      <div style={{ color: t.mode === 'light' ? '#2f7a4a' : '#6fcf97', fontSize: 10, fontWeight: 600, letterSpacing: 0.3 }}>
                        ✦ Trial active
                      </div>
                      <div style={{ color: t.textMuted, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>
                        {trial.exportsLeft} export{trial.exportsLeft === 1 ? '' : 's'} left ·{' '}
                        {trial.daysLeft} day{trial.daysLeft === 1 ? '' : 's'} remaining
                      </div>
                    </div>
                  )}
                  {eff === 'free' && (
                    <div style={{ color: t.textMuted, fontSize: 9, marginTop: 4 }}>
                      Free tier
                    </div>
                  )}
                </div>
                <div style={{ borderTop: `1px solid ${t.borderHard}`, marginTop: 4, paddingTop: 4 }}>
                  <button
                    onClick={() => { setShowBrand(true); setProfileOpen(false); }}
                    style={menuItem}
                  >
                    Brand settings
                  </button>
                  <button
                    onClick={() => { setShowPassword(true); setProfileOpen(false); }}
                    style={menuItem}
                  >
                    Set / change password
                  </button>
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      window.dispatchEvent(new CustomEvent('autobook:start-tour'));
                    }}
                    style={menuItem}
                  >
                    Take the tour
                  </button>
                  <button
                    onClick={() => { setShowDesktop(true); setProfileOpen(false); }}
                    style={menuItem}
                  >
                    ↓ Download desktop app
                  </button>
                  <button
                    onClick={async () => {
                      setProfileOpen(false);
                      try {
                        await refreshUserTier();
                        const fresh = getStoredUser();
                        alert(fresh?.tier
                          ? `Account refreshed. Current tier: ${fresh.tier}.`
                          : "Couldn't refresh — try signing out and back in.");
                      } catch (err) {
                        alert("Couldn't refresh account. Try signing out and back in.");
                      }
                    }}
                    style={menuItem}
                  >
                    ↻ Refresh account
                  </button>
                  <button
                    onClick={() => { setShowSupport(true); setProfileOpen(false); }}
                    style={menuItem}
                  >
                    ✉ Contact support
                  </button>
                  <button
                    onClick={() => { setShowReferral(true); setProfileOpen(false); }}
                    style={{ ...menuItem, color: '#6fcf97' }}
                  >
                    ↺ Refer & earn 20% off
                  </button>
                  <button
                    onClick={() => { toggleTheme(); }}
                    style={menuItem}
                    title="Switch between light and dark interface"
                  >
                    {themeMode === 'light' ? '🌙 Switch to dark theme' : '🌞 Switch to light theme'}
                  </button>
                  <button
                    onClick={() => { setUpgradeReason('plans'); setProfileOpen(false); }}
                    style={{ ...menuItem, color: eff === 'free' ? '#f6c90e' : t.textStrong }}
                  >
                    {eff === 'pro' ? 'View plans'
                     : eff === 'starter' ? 'Upgrade to Pro'
                     : eff === 'trial' ? 'View plans (trial active)'
                     : '✦ Upgrade plan'}
                  </button>
                  <button
                    onClick={handleSignOut}
                    style={{ ...menuItem, color: '#e05c5c' }}
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
        <>
          <button
            onClick={() => setUpgradeReason('plans')}
            style={btnStyle({
              color: t.mode === 'light' ? '#7a5c00' : '#f6c90e',
              padding: '4px 12px',
              border: `1px solid ${t.mode === 'light' ? '#e8d27a' : '#3a2a08'}`,
              background: t.mode === 'light' ? '#fff8d6' : '#181208',
            })}
            title="See pricing and plans"
          >
            ✦ Plans
          </button>
          <button
            data-tour="profile"
            onClick={() => setSignup({ action: 'signin' })}
            style={btnStyle({ color: t.text, padding: '4px 12px' })}
            title="Sign in or sign up"
          >
            Sign in
          </button>
        </>
      )}

      {/* Autosave status */}
      <AutosaveBadge t={t} status={autosaveStatus.status} meta={autosaveStatus.meta} />

      {/* Preview */}
      <button data-tour="preview" onClick={onPreview}
        style={btnStyle({ color: t.text, border: `1px solid ${t.border}` })}
        title="Full-screen book preview">
        ▶ Preview
      </button>

      <button data-tour="share" onClick={() => setShowShare(true)}
        style={btnStyle({
          color: t.mode === 'light' ? '#3a6020' : '#9fb88b',
          border: `1px solid ${t.mode === 'light' ? '#a8c890' : '#2a3a20'}`,
          background: t.mode === 'light' ? '#f0f7e8' : '#0e1408',
        })}
        title="Share a read-only preview link with your client (Premium)">
        ✦ Share
      </button>

      <Divider t={t} />

      {/* My Projects — switch / create / duplicate / delete · also holds backup */}
      <button data-tour="projects" onClick={() => setShowProjects(true)}
        style={btnStyle({ color: t.text, border: `1px solid ${t.border}` })}
        title="Switch between projects · create new · duplicate · delete · backup/restore">
        📁 Projects
      </button>

      {/* Export — single button with JPG / PDF / Choose-spreads options */}
      <div data-tour="export">
        <ExportMenu
          t={t}
          onExportJPGs={handleExportAll}
          onExportPDF={handleExportPDF}
          onChooseSpreads={openSpreadPicker}
          exporting={exporting}
          exportingPDF={exportingPDF}
          anchorTop={headerBottom}
        />
      </div>

      <ExportOverlay
        open={exporting || exportingPDF}
        mode={exportingPDF ? 'pdf' : 'jpg'}
      />

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
      <DesktopAppModal
        open={showDesktop}
        onClose={() => setShowDesktop(false)}
        onUpgradeClick={() => { setShowDesktop(false); setUpgradeReason('plans'); }}
      />
      <SupportModal open={showSupport} onClose={() => setShowSupport(false)} />
      <ReferralModal open={showReferral} onClose={() => setShowReferral(false)} />
      <UpgradeModal
        open={Boolean(upgradeReason)}
        onClose={() => { setUpgradeReason(null); pendingExportRef.current = null; }}
        blockedFeature={upgradeReason === 'export' ? 'exporting this book' : null}
        onUnlockSuccess={async () => {
          // Per-book unlock landed — close the modal and run the queued
          // export so the user gets their download with no extra clicks.
          const pending = pendingExportRef.current;
          pendingExportRef.current = null;
          setUpgradeReason(null);
          if (pending) {
            try { await trackEvent('photobook_export'); } catch { /* ignore */ }
            refreshUserTier();
            await pending();
          }
        }}
      />
      <ShareModal open={showShare} onClose={() => setShowShare(false)} stageRef={stageRef} />
      <SpreadExportPicker
        open={showSpreadPicker}
        onClose={() => setShowSpreadPicker(false)}
        onExport={handleSpreadPickerExport}
      />
    </header>
  );
}

// Combined export dropdown — All JPGs / Print PDF fast paths plus a
// "Choose spreads…" option that opens a picker for partial exports.
// Secondary-tools dropdown — Arrange / Repeated / Blend / Gap / Print.
// Consolidates less-frequently-used buttons so the toolbar stays
// compact even on narrow screens.
function ToolsMenu({
  t,
  anchorTop = 48,
  onArrange, onRepeated, onDedupe, onPrintPreview,
  repeatedCount = 0, arranged = false,
  blendEdges, setBlendEdges,
  gap, setGap,
}) {
  const [open, setOpen] = useState(false);
  const hasAlert = repeatedCount > 0; // red dot on the button when there's something to notice
  const btnStyle = makeBtnStyle(t);
  const toolMenuItem = makeToolMenuItem(t);
  const toolMenuSub = makeToolMenuSub(t);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          ...btnStyle({ color: t.text, border: `1px solid ${t.border}` }),
          display: 'flex', alignItems: 'center', gap: 5,
        }}
        title="Arrange, repeated photos, blend edges, gap, print preview"
      >
        ✨ Tools ▾
        {hasAlert && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#e05c5c', display: 'inline-block',
          }} />
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'transparent' }}
          />
          <div style={{
            position: 'fixed', right: 10, top: anchorTop,
            zIndex: 31,
            background: t.bgMenu, border: `1px solid ${t.borderSoft}`,
            borderRadius: 6, padding: 6, minWidth: 240,
            boxShadow: `0 8px 24px ${t.shadow}`,
          }}>
            <button
              onClick={() => { setOpen(false); onArrange(); }}
              style={toolMenuItem}
              title="Fill empty cells on the current spread with unplaced photos"
            >
              <span style={{ color: arranged ? '#6fcf97' : t.textStrong }}>
                {arranged ? '✓ Done' : '⟐ Arrange'} <span style={toolMenuSub}>current spread</span>
              </span>
            </button>

            <button
              onClick={() => { onRepeated(); /* stay open so user can hit Fix */ }}
              style={toolMenuItem}
              title={repeatedCount > 0 ? 'Clear highlight' : 'Highlight photos used in multiple cells'}
            >
              <span style={{ color: repeatedCount > 0 ? '#e05c5c' : t.textStrong }}>
                ⚠ {repeatedCount > 0 ? `${repeatedCount} repeated` : 'Repeated photos'}
                <span style={toolMenuSub}>{repeatedCount > 0 ? 'click to clear' : 'find duplicates'}</span>
              </span>
            </button>

            {repeatedCount > 0 && (
              <button
                onClick={() => { setOpen(false); onDedupe(); }}
                style={{ ...toolMenuItem, background: t.bgHover }}
                title="Keep first use of each photo, clear duplicates"
              >
                <span style={{ color: '#f6c90e' }}>
                  ✓ Auto-fix duplicates <span style={toolMenuSub}>keep first use</span>
                </span>
              </button>
            )}

            <button
              onClick={() => setBlendEdges(!blendEdges)}
              style={toolMenuItem}
              title="Fade photo edges for a soft, editorial look"
            >
              <span style={{ color: blendEdges ? '#b89fff' : t.textStrong }}>
                ◈ Blend edges: {blendEdges ? 'On' : 'Off'}
                <span style={toolMenuSub}>soft editorial look</span>
              </span>
            </button>

            <div style={{ height: 1, background: t.borderHard, margin: '6px 4px' }} />

            <div style={{ padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: t.textMuted }}>Cell gap</span>
                <span style={{ fontSize: 11, color: t.textDim, fontVariantNumeric: 'tabular-nums' }}>{gap}px</span>
              </div>
              <input type="range" min={0} max={20} step={1} value={gap}
                onChange={(e) => setGap(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#4f8ef7' }}
              />
            </div>

            <div style={{ height: 1, background: t.borderHard, margin: '6px 4px' }} />

            <button
              onClick={() => { setOpen(false); onPrintPreview(); }}
              style={toolMenuItem}
              title="Print preview with CMYK simulation and DPI specs"
            >
              <span style={{ color: '#d4843a' }}>
                ⬡ Print preview <span style={toolMenuSub}>CMYK + DPI specs</span>
              </span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ExportMenu({ t, onExportJPGs, onExportPDF, onChooseSpreads, exporting, exportingPDF, anchorTop = 48 }) {
  const [open, setOpen] = useState(false);
  const busy = exporting || exportingPDF;
  const label = exporting ? 'Exporting JPGs…' : exportingPDF ? 'Preparing PDF…' : '↓ Export ▾';
  const btnStyle = makeBtnStyle(t);
  const exportMenuItem = makeExportMenuItem(t);
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
            position: 'fixed', right: 10, top: anchorTop,
            zIndex: 31,
            background: t.bgMenu, border: `1px solid ${t.borderSoft}`,
            borderRadius: 6, padding: 4, minWidth: 200,
            boxShadow: `0 8px 24px ${t.shadow}`,
          }}>
            <button
              onClick={() => { setOpen(false); onExportJPGs(); }}
              style={exportMenuItem}
              title="All spreads saved as numbered JPGs to a folder"
            >
              <span style={{ color: '#6a9fd8', fontWeight: 600 }}>↓ All JPGs</span>
              <span style={{ fontSize: 9, color: t.textFaint, marginTop: 2 }}>Numbered images, one per spread</span>
            </button>
            <button
              onClick={() => { setOpen(false); onExportPDF(); }}
              style={exportMenuItem}
              title="Print-ready PDF with all spreads"
            >
              <span style={{ color: '#d4843a', fontWeight: 600 }}>⬡ Print PDF</span>
              <span style={{ fontSize: 9, color: t.textFaint, marginTop: 2 }}>Single PDF for print shops</span>
            </button>
            <div style={{ height: 1, background: t.borderHard, margin: '4px 0' }} />
            <button
              onClick={() => { setOpen(false); onChooseSpreads?.(); }}
              style={exportMenuItem}
              title="Pick specific spreads and choose format"
            >
              <span style={{ color: '#b89fff', fontWeight: 600 }}>✂ Choose spreads…</span>
              <span style={{ fontSize: 9, color: t.textFaint, marginTop: 2 }}>Pick which to export + format</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const makeToolMenuItem = (_t) => ({
  display: 'flex', alignItems: 'flex-start',
  width: '100%', textAlign: 'left',
  padding: '8px 12px',
  background: 'none', border: 'none',
  fontSize: 12, cursor: 'pointer',
  borderRadius: 4,
});
const makeToolMenuSub = (t) => ({
  display: 'block', fontSize: 9, color: t.textDim, marginTop: 2, fontWeight: 400,
});

const makeExportMenuItem = (_t) => ({
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
  width: '100%', textAlign: 'left',
  padding: '8px 12px',
  background: 'none', border: 'none',
  fontSize: 12, cursor: 'pointer',
  borderRadius: 4,
});

function AutosaveBadge({ t, status, meta }) {
  const map = {
    idle:        { label: '',                color: t.textFaint, bg: 'transparent' },
    saving:      { label: '⋯ Saving',        color: t.textMuted, bg: t.bgInput },
    saved:       { label: '✓ Saved',         color: '#6fcf97',   bg: t.mode === 'light' ? '#e8f5ec' : '#0e1a10' },
    'too-large': { label: '⚠ Layout saved (photos too large)', color: '#c9a227', bg: t.mode === 'light' ? '#fdf6e3' : '#1a1408' },
    error:       { label: '⚠ Autosave failed', color: '#e05c5c', bg: t.mode === 'light' ? '#fde8e8' : '#1a0808' },
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
        border: s.bg === 'transparent' ? 'none' : `1px solid ${t.border}`,
        flexShrink: 0, whiteSpace: 'nowrap',
      }}
    >{s.label}</span>
  );
}

const makeMenuItem = (t) => ({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '7px 10px',
  background: 'none',
  border: 'none',
  color: t.textStrong,
  fontSize: 11,
  cursor: 'pointer',
  borderRadius: 3,
});
