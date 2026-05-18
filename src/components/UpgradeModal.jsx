import { useState } from 'react';
import { STARTER_FEATURES, PRO_FEATURES, FREE_FEATURES } from '../utils/premium';
import { openPaystackCheckout, claimPlan, isPaystackConfigured, formatPrice } from '../utils/paystack';
import { useAuthUser } from '../utils/supabase';

export default function UpgradeModal({ open, onClose, blockedFeature }) {
  const [paying, setPaying] = useState(false); // 'starter' | 'pro' | false
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  if (!open) return null;

  const user = useAuthUser();
  const canPay = isPaystackConfigured() && user?.email;

  const handlePay = async (plan) => {
    if (!canPay || paying) return;
    setError(null);
    setPaying(plan);
    try {
      const reference = await openPaystackCheckout({ email: user.email, plan });
      await claimPlan(plan, reference);
      setSuccess(plan);
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
        borderRadius: 10, padding: '22px 26px',
        width: 720, maxWidth: '94vw',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e8e8e8', marginBottom: 4 }}>
          {blockedFeature ? 'Premium feature' : 'Pick a plan'}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20, lineHeight: 1.5 }}>
          {blockedFeature
            ? <>This <b style={{ color: '#ddd' }}>{blockedFeature}</b> requires a paid plan.</>
            : 'One-time payment. Unlocks Premium features on this account.'}
        </div>

        {!isPaystackConfigured() && (
          <div style={warnBox}>⚠ Paystack not configured. Owner: set VITE_PAYSTACK_PUBLIC_KEY in .env.production.</div>
        )}
        {!user?.email && (
          <div style={warnBox}>Sign in first (Save or Export a photobook) — your account needs an email so the receipt can be sent.</div>
        )}

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>
          {/* STARTER */}
          <PlanCard
            name="Starter"
            price={formatPrice('starter')}
            badge="10 photobooks"
            badgeColor="#6fcf97"
            accentColor="#2a4a2a"
            features={STARTER_FEATURES}
            buttonLabel={
              success === 'starter' ? '✓ Activated' :
              paying === 'starter' ? 'Opening Paystack…' :
              `Choose Starter · ${formatPrice('starter')}`
            }
            onClick={() => handlePay('starter')}
            disabled={!canPay || paying || success}
            success={success === 'starter'}
          />
          {/* PRO */}
          <PlanCard
            name="Pro"
            price={formatPrice('pro')}
            badge="Unlimited + Pro templates"
            badgeColor="#f6c90e"
            accentColor="#3a2a08"
            features={PRO_FEATURES}
            highlight
            buttonLabel={
              success === 'pro' ? '✓ Activated' :
              paying === 'pro' ? 'Opening Paystack…' :
              `Choose Pro · ${formatPrice('pro')}`
            }
            onClick={() => handlePay('pro')}
            disabled={!canPay || paying || success}
            success={success === 'pro'}
          />
        </div>

        {error && <div style={errBox}>{error}</div>}
        {success && <div style={okBox}>✓ {success === 'pro' ? 'Pro' : 'Starter'} activated. Refreshing…</div>}

        {/* Free tier reference */}
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: '#666', cursor: 'pointer', padding: '4px 0' }}>
            What stays free
          </summary>
          <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 12px', marginTop: 4 }}>
            {FREE_FEATURES.map((f) => (
              <div key={f.key} style={{ marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: '#999' }}>· {f.name}</span>
                {f.detail && <div style={{ color: '#555', fontSize: 10, marginLeft: 10 }}>{f.detail}</div>}
              </div>
            ))}
          </div>
        </details>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={Boolean(paying)} style={btnGhost}>Not now</button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({ name, price, badge, badgeColor, accentColor, features, buttonLabel, onClick, disabled, highlight, success }) {
  return (
    <div style={{
      background: highlight ? '#161208' : '#161616',
      border: `1px solid ${highlight ? '#3a2a08' : '#1f1f1f'}`,
      borderRadius: 8,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: highlight ? '#f6c90e' : '#ddd' }}>
          {highlight ? '✦ ' : ''}{name}
        </span>
        <span style={{ fontSize: 9, color: badgeColor, background: accentColor, padding: '3px 8px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {badge}
        </span>
      </div>

      <div style={{ fontSize: 26, fontWeight: 700, color: '#e8e8e8', marginTop: 8 }}>
        {price}
        <span style={{ fontSize: 11, color: '#666', fontWeight: 400, marginLeft: 6 }}>one-time</span>
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {features.map((f) => (
          <div key={f.key} style={{ marginBottom: 8, fontSize: 12 }}>
            <div style={{ color: '#ddd' }}>· {f.name}</div>
            {f.detail && <div style={{ color: '#666', fontSize: 10, marginLeft: 10 }}>{f.detail}</div>}
          </div>
        ))}
      </div>

      <button onClick={onClick} disabled={disabled} style={{
        marginTop: 14,
        padding: '11px 14px',
        fontSize: 12, fontWeight: 600,
        background: success ? '#0e1a10' : highlight ? '#3a2a08' : '#1a3580',
        color: success ? '#6fcf97' : highlight ? '#f6c90e' : '#fff',
        border: highlight ? '1px solid #5a4010' : 'none',
        borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}>
        {buttonLabel}
      </button>
    </div>
  );
}

const warnBox = {
  padding: '8px 10px', marginBottom: 14,
  background: '#1a1408', border: '1px solid #3a2a10',
  color: '#f6c90e', fontSize: 11, borderRadius: 5,
};
const errBox = {
  padding: '8px 10px', marginBottom: 10,
  background: '#1a0808', border: '1px solid #5a1a1a',
  color: '#e05c5c', fontSize: 11, borderRadius: 5,
};
const okBox = {
  padding: '10px 12px', marginBottom: 10,
  background: '#0e1a10', border: '1px solid #2a4a2a',
  color: '#6fcf97', fontSize: 12, borderRadius: 5,
};
const btnGhost = {
  padding: '8px 14px', fontSize: 12,
  background: 'transparent', color: '#666', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
