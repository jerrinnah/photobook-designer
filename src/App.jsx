import { useRef, useState, useEffect } from 'react';
import PhotoPanel from './components/PhotoPanel';
import SpreadNav from './components/SpreadNav';
import SpreadCanvas from './components/SpreadCanvas';
import LayoutPicker from './components/LayoutPicker';
import Toolbar from './components/Toolbar';
import PreviewMode from './components/PreviewMode';
import PrintPreview from './components/PrintPreview';
import MobileShell from './components/MobileShell';
import RotateOverlay from './components/RotateOverlay';
import AdminDashboard from './components/AdminDashboard';
import ClientProofingView from './components/ClientProofingView';
import Tour, { hasSeenTour } from './components/Tour';
import NameProjectHint from './components/NameProjectHint';
import LandingPage from './components/LandingPage';
import ShareProgressToast from './components/ShareProgressToast';
import DeviceBlockedModal from './components/DeviceBlockedModal';
import CrashRecoveryToast from './components/CrashRecoveryToast';
import StorageQuotaBanner from './components/StorageQuotaBanner';
import CloudSyncBanner from './components/CloudSyncBanner';
import ResumeToast from './components/ResumeToast';
import { hasEngaged, startSessionLivenessCheck } from './utils/supabase';
import { useViewport } from './hooks/useIsMobile';
import { useTheme } from './utils/theme';

export default function App() {
  const { t } = useTheme();
  const stageRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);
  const [printPreviewing, setPrintPreviewing] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState(null); // { message } | null
  const { isMobile, isPortrait } = useViewport();

  // Listen for device-limit signals fired from supabase.js when a
  // post-sign-in claim_device returns 'blocked'.
  useEffect(() => {
    const onBlocked = (e) => setDeviceBlocked({ message: e?.detail?.message || '' });
    window.addEventListener('autobook:device-blocked', onBlocked);
    return () => window.removeEventListener('autobook:device-blocked', onBlocked);
  }, []);

  // Auto-start the tour for first-time visitors. We delay slightly so the
  // toolbar has a chance to mount before Tour queries data-tour selectors.
  useEffect(() => {
    if (hasSeenTour()) return;
    const t = setTimeout(() => setTourOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Server-side account deletion safety net. If an admin deletes the
  // signed-in user, this catches it on visibilitychange / focus / 5-min
  // poll and force-signs-them-out instead of letting them keep using a
  // dead JWT until expiry (default 1 hour).
  useEffect(() => {
    return startSessionLivenessCheck();
  }, []);

  // Rehydrate the linked .autobook file handle so ⌘S keeps writing to
  // the same file after a page refresh. Silent no-op on browsers that
  // don't support File System Access (Safari, Firefox) or on first run.
  useEffect(() => {
    (async () => {
      try {
        const { restoreLinkedFileHandle } = await import('./utils/projectFile');
        await restoreLinkedFileHandle();
      } catch (e) {
        console.info('[projectFile] restore skipped:', e?.message);
      }
    })();
  }, []);

  // Boot-time pending-claim replay. If a payment confirmed in a previous
  // session but the grant request never landed (network drop, server
  // hiccup), re-attempt the grant here. Successful claims dispatch
  // 'autobook:claim-applied' which we listen for to refresh the UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { replayPendingClaims } = await import('./utils/pendingClaim');
        if (!cancelled) await replayPendingClaims();
      } catch (e) {
        console.info('[pendingClaim] replay skipped:', e?.message);
      }
    })();
    const onApplied = () => {
      // Tier likely changed — easiest way to reflect it everywhere is a
      // soft reload. Delay slightly so the user can see the success.
      setTimeout(() => window.location.reload(), 800);
    };
    window.addEventListener('autobook:claim-applied', onApplied);
    return () => {
      cancelled = true;
      window.removeEventListener('autobook:claim-applied', onApplied);
    };
  }, []);

  // Listen for replay requests from the profile menu
  useEffect(() => {
    const onReplay = () => setTourOpen(true);
    window.addEventListener('autobook:start-tour', onReplay);
    return () => window.removeEventListener('autobook:start-tour', onReplay);
  }, []);

  // If the user landed here via a landing-page CTA (e.g. ?plan=pro),
  // surface the UpgradeModal preselected to that plan. Toolbar owns
  // the modal and listens for autobook:open-upgrade.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan');
    if (!plan) return;
    // Defer one frame so Toolbar has mounted its listener.
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('autobook:open-upgrade', { detail: { plan } }));
      // Strip the param so a refresh doesn't keep re-opening the modal.
      params.delete('plan');
      const next = params.toString();
      window.history.replaceState({}, '', next ? `?${next}` : window.location.pathname);
    }, 50);
    return () => clearTimeout(t);
  }, []);

  // Routes (URL-based)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    // Client proofing portal — anyone with the share token gets a read-only viewer
    const shareToken = params.get('share');
    if (shareToken) return <ClientProofingView token={shareToken} />;
    // Admin dashboard
    if (params.has('admin')) return <AdminDashboard />;
    // Marketing landing page at "/" — but only for cold visitors.
    // Anyone who has signed in OR even just requested a magic link
    // skips the landing and lands in the editor. The marketing page
    // would be redundant for them.
    if (!params.has('app') && !hasEngaged()) return <LandingPage />;
  }

  if (isMobile) {
    return (
      <>
        <MobileShell stageRef={stageRef} />
        {isPortrait && <RotateOverlay />}
        <DeviceBlockedModal
          open={Boolean(deviceBlocked)}
          message={deviceBlocked?.message}
          onClose={() => setDeviceBlocked(null)}
        />
        <CrashRecoveryToast />
        <StorageQuotaBanner />
        <CloudSyncBanner />
        <ResumeToast />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: t.bg, color: t.text, fontFamily: 'system-ui, sans-serif' }}>
      <Toolbar stageRef={stageRef} onPreview={() => setPreviewing(true)} onPrintPreview={() => setPrintPreviewing(true)} />
      <NameProjectHint />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SpreadNav />
        <PhotoPanel />
        <main style={{ flex: 1, display: 'flex', overflow: 'hidden', background: t.bgCanvas }}>
          <SpreadCanvas stageRef={stageRef} />
        </main>
        <LayoutPicker />
      </div>

      {previewing && <PreviewMode onClose={() => setPreviewing(false)} />}
      {printPreviewing && <PrintPreview onClose={() => setPrintPreviewing(false)} />}
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
      <ShareProgressToast />
      <DeviceBlockedModal
        open={Boolean(deviceBlocked)}
        message={deviceBlocked?.message}
        onClose={() => setDeviceBlocked(null)}
      />
      <CrashRecoveryToast />
    </div>
  );
}
