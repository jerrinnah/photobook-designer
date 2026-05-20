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
import { useViewport } from './hooks/useIsMobile';

export default function App() {
  const stageRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);
  const [printPreviewing, setPrintPreviewing] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const { isMobile, isPortrait } = useViewport();

  // Auto-start the tour for first-time visitors. We delay slightly so the
  // toolbar has a chance to mount before Tour queries data-tour selectors.
  useEffect(() => {
    if (hasSeenTour()) return;
    const t = setTimeout(() => setTourOpen(true), 600);
    return () => clearTimeout(t);
  }, []);

  // Listen for replay requests from the profile menu
  useEffect(() => {
    const onReplay = () => setTourOpen(true);
    window.addEventListener('autobook:start-tour', onReplay);
    return () => window.removeEventListener('autobook:start-tour', onReplay);
  }, []);

  // Routes (URL-based)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    // Client proofing portal — anyone with the share token gets a read-only viewer
    const shareToken = params.get('share');
    if (shareToken) return <ClientProofingView token={shareToken} />;
    // Admin dashboard
    if (params.has('admin')) return <AdminDashboard />;
    // Marketing landing page is the default at "/" — visitors must
    // explicitly enter the editor via ?app=1 (or a CTA button on the
    // landing page). Existing users can bookmark ?app=1 directly.
    if (!params.has('app')) return <LandingPage />;
  }

  if (isMobile) {
    return (
      <>
        <MobileShell stageRef={stageRef} />
        {isPortrait && <RotateOverlay />}
      </>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0d0d0d', color: '#e0e0e0', fontFamily: 'system-ui, sans-serif' }}>
      <Toolbar stageRef={stageRef} onPreview={() => setPreviewing(true)} onPrintPreview={() => setPrintPreviewing(true)} />
      <NameProjectHint />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <SpreadNav />
        <PhotoPanel />
        <main style={{ flex: 1, display: 'flex', overflow: 'hidden', background: '#181818' }}>
          <SpreadCanvas stageRef={stageRef} />
        </main>
        <LayoutPicker />
      </div>

      {previewing && <PreviewMode onClose={() => setPreviewing(false)} />}
      {printPreviewing && <PrintPreview onClose={() => setPrintPreviewing(false)} />}
      <Tour open={tourOpen} onClose={() => setTourOpen(false)} />
    </div>
  );
}
