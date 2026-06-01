// Shown after sign-in when claim_device returns 'blocked' because the
// account is already in use on 2 other devices on different networks.

export default function DeviceBlockedModal({ open, message, onClose }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#141414', border: '1px solid #5a1a1a',
        borderRadius: 10, padding: '26px 30px',
        width: 460, maxWidth: '92vw',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#e89a9a' }}>
          ⚠ Device limit reached
        </div>
        <div style={{ fontSize: 13, color: '#bbb', lineHeight: 1.6, marginBottom: 18 }}>
          {message || 'This account is already active on 2 other devices on different networks. To use it here, sign out from one of the other devices first.'}
        </div>
        <div style={{
          padding: '10px 12px', marginBottom: 18,
          background: '#0c1620', border: '1px solid #1e3a5f',
          borderRadius: 6, fontSize: 12, color: '#9fb8d8', lineHeight: 1.55,
        }}>
          Need to move to a new device? Email <b>support@autobookbynej.online</b> and
          we'll free a slot. Up to 2 devices per account are allowed; both must
          share the same internet connection (or be released by support).
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '9px 20px', fontSize: 12, fontWeight: 600,
            background: '#1a3580', color: '#fff', border: 'none',
            borderRadius: 5, cursor: 'pointer',
          }}>OK</button>
        </div>
      </div>
    </div>
  );
}
