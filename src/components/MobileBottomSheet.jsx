import { useEffect } from 'react';

// Slide-up bottom sheet for mobile panels. Closes on backdrop tap or swipe down.
export default function MobileBottomSheet({ open, onClose, title, children, height = '75vh' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.55)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s',
        }}
      />
      {/* Sheet */}
      <div
        className="safe-bottom"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 51,
          height,
          background: '#111',
          borderTopLeftRadius: 14, borderTopRightRadius: 14,
          boxShadow: '0 -10px 40px rgba(0,0,0,0.6)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drag handle */}
        <div style={{
          flexShrink: 0,
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          padding: '8px 0 4px',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2a2a2a' }} />
        </div>
        {/* Header */}
        {title && (
          <div style={{
            flexShrink: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 16px 10px', borderBottom: '1px solid #1a1a1a',
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>{title}</span>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#666',
              fontSize: 16, cursor: 'pointer', padding: '4px 8px',
            }}>✕</button>
          </div>
        )}
        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {children}
        </div>
      </div>
    </>
  );
}
