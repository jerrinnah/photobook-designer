import DesktopDownloads from './DesktopDownloads';

// Thin modal wrapper around DesktopDownloads — opened from the profile
// menu when someone explicitly wants the desktop installer (rather than
// scrolling to the bottom of the upgrade modal).
export default function DesktopAppModal({ open, onClose }) {
  if (!open) return null;
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
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 14, color: '#e8e8e8' }}>
          Get AutoBook for desktop
        </div>
        <DesktopDownloads />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{
            padding: '8px 14px', fontSize: 12,
            background: 'transparent', color: '#888',
            border: '1px solid #2a2a2a', borderRadius: 5, cursor: 'pointer',
          }}>Close</button>
        </div>
      </div>
    </div>
  );
}
