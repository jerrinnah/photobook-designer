// Full-screen overlay shown while spreads are being rasterized + saved.
// Blocks clicks so the user can't accidentally trigger a second export
// or close the active spread mid-capture (which would corrupt the PDF /
// folder dump). Animation is a pure-CSS spinner — no extra deps.

export default function ExportOverlay({ open, mode }) {
  if (!open) return null;
  const label = mode === 'pdf'
    ? 'Preparing your print-ready PDF…'
    : 'Exporting your spreads…';
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(8,8,10,0.78)',
        backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        cursor: 'wait',
      }}
      // Swallow every interaction while exporting.
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onKeyDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <style>{`
        @keyframes autobook-export-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes autobook-export-pulse {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
      `}</style>

      <div style={{
        width: 64, height: 64,
        border: '4px solid rgba(255,255,255,0.10)',
        borderTopColor: '#f6c90e',
        borderRadius: '50%',
        animation: 'autobook-export-spin 0.9s linear infinite',
        marginBottom: 22,
      }} />

      <div style={{
        fontSize: 16, fontWeight: 600, color: '#f0f0f0',
        letterSpacing: 0.2, marginBottom: 6,
        animation: 'autobook-export-pulse 1.8s ease-in-out infinite',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 12, color: '#9a9a9a',
        maxWidth: 320, textAlign: 'center', lineHeight: 1.55,
      }}>
        Cycling through each spread to capture full-resolution images.
        Please don't close this tab.
      </div>
    </div>
  );
}
