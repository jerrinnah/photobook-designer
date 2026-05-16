import { useRef, useState } from 'react';
import PhotoPanel from './components/PhotoPanel';
import SpreadNav from './components/SpreadNav';
import SpreadCanvas from './components/SpreadCanvas';
import LayoutPicker from './components/LayoutPicker';
import Toolbar from './components/Toolbar';
import PreviewMode from './components/PreviewMode';
import PrintPreview from './components/PrintPreview';
import MobileShell from './components/MobileShell';
import RotateOverlay from './components/RotateOverlay';
import { useViewport } from './hooks/useIsMobile';

export default function App() {
  const stageRef = useRef(null);
  const [previewing, setPreviewing] = useState(false);
  const [printPreviewing, setPrintPreviewing] = useState(false);
  const { isMobile, isPortrait } = useViewport();

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
    </div>
  );
}
