import { useState } from 'react';
import { PREMIUM_FEATURES, FREE_FEATURES } from '../utils/premium';
import { openPaystackCheckout, claimPremium, isPaystackConfigured, formatPrice } from '../utils/paystack';
import { getStoredUser } from '../utils/supabase';

export default function UpgradeModal({ open, onClose, blockedFeature }) {
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  if (!open) return null;

  const user = getStoredUser();
  const canPay = isPaystackConfigured() && user?.email;

  const handlePay = async () => {
    if (!canPay || paying) return;
    setError(null);
    setPaying(true);
    try {
      const reference = await openPaystackCheckout({ email: user.email });
      await claimPremium(reference);
      setSuccess(true);
      // Brief celebration, then refresh so locked thumbnails unlock everywhere
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err.message || 'Payment failed. Try again.');
    } finally {
      setPaying(false);
    }
  };
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

        {success && (
          <div style={{
            padding: '10px 12px', marginBottom: 12,
            background: '#0e1a10', border: '1px solid #2a4a2a',
            color: '#6fcf97', fontSize: 12, borderRadius: 5,
          }}>
            ✓ Premium activated. Refreshing…
          </div>
        )}
        {error && (
          <div style={{
            padding: '8px 10px', marginBottom: 12,
            background: '#1a0808', border: '1px solid #5a1a1a',
            color: '#e05c5c', fontSize: 11, borderRadius: 5,
          }}>{error}</div>
        )}
        {!canPay && !success && (
          <div style={{
            padding: '8px 10px', marginBottom: 12,
            background: '#1a1408', border: '1px solid #3a2a10',
            color: '#f6c90e', fontSize: 11, borderRadius: 5,
          }}>
            {!user?.email
              ? 'Sign up first (Save or Export a photobook) to unlock the Pay button.'
              : '⚠ Paystack not configured. Owner: set VITE_PAYSTACK_PUBLIC_KEY.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={paying} style={btnGhost}>Not now</button>
          <button
            onClick={handlePay}
            disabled={!canPay || paying || success}
            style={{
              ...btnPrimary,
              opacity: (!canPay || paying || success) ? 0.5 : 1,
              cursor: (!canPay || paying || success) ? 'not-allowed' : 'pointer',
            }}
          >
            {success
              ? '✓ Activated'
              : paying
                ? 'Opening Paystack…'
                : `✦ Upgrade · ${formatPrice()}`}
          </button>
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
