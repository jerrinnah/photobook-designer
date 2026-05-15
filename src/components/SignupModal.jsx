import { useState } from 'react';
import { signUp, isSupabaseConfigured } from '../utils/supabase';

// Soft-gate modal — pops the first time a user clicks Save or Export.
// After successful signup, calls onComplete which proceeds with the original action.
export default function SignupModal({ open, action, onClose, onComplete }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validPhone = phone.replace(/\D/g, '').length >= 7;

  const submit = async (e) => {
    e.preventDefault();
    if (!validEmail || !validPhone || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signUp({ email, phone });
      onComplete?.();
    } catch (err) {
      setError(err.message || 'Signup failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', border: '1px solid #1f1f1f',
        borderRadius: 10, padding: '28px 30px',
        width: 380, maxWidth: '92vw',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#e8e8e8', marginBottom: 6 }}>
          {action === 'save' ? 'Almost ready to save' : action === 'export' ? 'One step before exporting' : 'Save your work'}
        </div>
        <div style={{ fontSize: 12, color: '#777', marginBottom: 18, lineHeight: 1.55 }}>
          Quick signup so we can keep your photobook history and notify you about new templates. No password required.
        </div>

        {!isSupabaseConfigured && (
          <div style={{
            padding: '8px 10px', marginBottom: 14,
            background: '#1a1408', border: '1px solid #3a2a10',
            color: '#f6c90e', fontSize: 11, borderRadius: 5,
          }}>
            ⚠ Signup is not connected yet. (Supabase env vars missing.) Owner: see <code>SUPABASE_SETUP.md</code>.
          </div>
        )}

        <form onSubmit={submit}>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={labelStyle}>Email</span>
            <input
              type="email" autoFocus required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 18 }}>
            <span style={labelStyle}>Phone number</span>
            <input
              type="tel" required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              style={inputStyle}
            />
          </label>

          {error && (
            <div style={{
              padding: '8px 10px', marginBottom: 12,
              background: '#1a0808', border: '1px solid #5a1a1a',
              color: '#e05c5c', fontSize: 11, borderRadius: 5,
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={btnSecondary}>
              Skip for now
            </button>
            <button type="submit"
              disabled={!validEmail || !validPhone || submitting || !isSupabaseConfigured}
              style={{
                ...btnPrimary,
                opacity: (!validEmail || !validPhone || submitting || !isSupabaseConfigured) ? 0.5 : 1,
                cursor: (!validEmail || !validPhone || submitting || !isSupabaseConfigured) ? 'not-allowed' : 'pointer',
              }}>
              {submitting ? 'Signing up…' : 'Sign up & continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block', fontSize: 10, color: '#666',
  letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5,
};

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: '#181818', border: '1px solid #252525',
  borderRadius: 5, color: '#ddd', fontSize: 13,
  padding: '9px 11px', outline: 'none',
};

const btnPrimary = {
  padding: '8px 16px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 5, cursor: 'pointer',
};

const btnSecondary = {
  padding: '8px 14px', fontSize: 12,
  background: 'transparent', color: '#666', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
