// Full-screen overlay shown when a mobile device is in portrait.
// Dismisses automatically once the device is rotated to landscape.
export default function RotateOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: '#0c0c0c',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 28, padding: 32,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#e0e0e0',
      textAlign: 'center',
    }}>
      {/* Phone icon with rotation arc */}
      <div style={{
        position: 'relative',
        width: 130, height: 130,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Rotating arc */}
        <svg viewBox="0 0 130 130" width="130" height="130" style={{
          position: 'absolute', inset: 0,
          animation: 'rotateOverlaySpin 2.4s ease-in-out infinite',
        }}>
          <path
            d="M 25 65 A 40 40 0 1 1 65 105"
            fill="none"
            stroke="#4f8ef7"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
          <polygon points="60,95 72,108 60,118" fill="#4f8ef7" />
        </svg>

        {/* Phone outline that tilts */}
        <div style={{
          width: 54, height: 88,
          border: '3px solid #ddd',
          borderRadius: 8,
          position: 'relative',
          animation: 'rotateOverlayTilt 2.4s ease-in-out infinite',
        }}>
          <div style={{
            position: 'absolute', top: -1, left: '50%',
            transform: 'translateX(-50%)',
            width: 16, height: 3, background: '#ddd', borderRadius: 0,
          }} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
          Rotate your device
        </div>
        <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5, maxWidth: 280 }}>
          The photobook designer works best in landscape. Turn your phone sideways to continue.
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#444', marginTop: 8 }}>
        Make sure rotation isn't locked in your phone settings.
      </div>

      <style>{`
        @keyframes rotateOverlayTilt {
          0%, 30% { transform: rotate(0deg); }
          60%, 100% { transform: rotate(-90deg); }
        }
        @keyframes rotateOverlaySpin {
          0%, 30% { opacity: 0.3; }
          60%, 100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
