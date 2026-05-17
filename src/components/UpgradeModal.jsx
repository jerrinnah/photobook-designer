import { PREMIUM_FEATURES, FREE_FEATURES } from '../utils/premium';

export default function UpgradeModal({ open, onClose, blockedFeature }) {
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
        borderRadius: 10, padding: '24px 28px',
        width: 460, maxWidth: '92vw',
        maxHeight: '88vh', overflowY: 'auto',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>🔒</span>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Premium feature</span>
        </div>
        <div style={{ fontSize: 13, color: '#888', marginBottom: 18, lineHeight: 1.5 }}>
          {blockedFeature
            ? <>This <b style={{ color: '#ddd' }}>{blockedFeature}</b> requires a Premium account.</>
            : 'This feature requires a Premium account.'}
        </div>

        <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: '#f6c90e', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            ✦ Premium unlocks
          </div>
          {PREMIUM_FEATURES.map((f) => (
            <div key={f.key} style={{ marginBottom: 8, fontSize: 12 }}>
              <div style={{ color: '#ddd' }}>· {f.name}</div>
              <div style={{ color: '#666', fontSize: 11, marginLeft: 10 }}>{f.detail}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 8, padding: '12px 14px', marginBottom: 18 }}>
          <div style={{ fontSize: 10, color: '#6fcf97', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            Always free
          </div>
          {FREE_FEATURES.map((f) => (
            <div key={f.key} style={{ marginBottom: 6, fontSize: 11.5, color: '#999' }}>· {f.name}</div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnGhost}>Not now</button>
          <a
            href="mailto:devjerrynnah@gmail.com?subject=Premium%20upgrade%20—%20AutoBook&body=Hi,%20I%27d%20like%20to%20upgrade%20to%20Premium."
            style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            ✉ Contact for upgrade
          </a>
        </div>
      </div>
    </div>
  );
}

const btnPrimary = {
  padding: '9px 16px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 5, cursor: 'pointer',
};

const btnGhost = {
  padding: '9px 14px', fontSize: 12,
  background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
