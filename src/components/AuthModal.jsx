import { useState } from 'react';
import { sendMagicLink, isSupabaseConfigured } from '../utils/supabase';

// Replaces SignupModal. One email field, sends a magic link. Same link
// works for sign-in and sign-up — Supabase Auth resolves whether the
// email is new or returning.
export default function AuthModal({ open, onClose, action }) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  if (!open) return null;

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = async (e) => {
    e.preventDefault();
    if (!validEmail || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMagicLink(email, phone || null);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send link. Try again.');
    } finally {
      setSending(false);
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
        borderRadius: 10, padding: '28px 30px',
        width: 400, maxWidth: '92vw',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {sent
            ? 'Check your email'
            : action === 'save' ? 'Sign in to save your work'
            : action === 'export' ? 'Sign in to export'
            : 'Sign in or sign up'}
        </div>

        {!sent && (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 18, lineHeight: 1.55 }}>
            Enter your email — we'll send you a one-time sign-in link. Same email
            signs you back in next time. No password needed.
          </div>
        )}

        {!isSupabaseConfigured && (
          <div style={warnStyle}>
            ⚠ Backend not configured. Owner: see <code>SUPABASE_AUTH_SETUP.md</code>.
          </div>
        )}

        {sent ? (
          <div style={{ padding: '16px 0' }}>
            <div style={{ fontSize: 13, color: '#6fcf97', marginBottom: 10 }}>
              ✓ Magic link sent to <b style={{ color: '#ddd' }}>{email}</b>
            </div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
              Open the email on this device and click the sign-in button.
              You'll land back here, automatically signed in. The link
              expires in 1 hour.
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 16 }}>
              Wrong email? <button onClick={() => { setSent(false); setEmail(''); setPhone(''); }} style={linkBtn}>Try another</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={labelStyle}>Email</span>
              <input
                type="email" autoFocus required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelStyle}>Phone <span style={{ textTransform: 'none', color: '#444' }}>(optional)</span></span>
              <input
                type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                style={inputStyle}
              />
            </label>

            {error && <div style={errStyle}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" onClick={onClose} disabled={sending} style={btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={!validEmail || sending || !isSupabaseConfigured} style={{
                ...btnPrimary,
                opacity: (!validEmail || sending || !isSupabaseConfigured) ? 0.5 : 1,
                cursor: (!validEmail || sending || !isSupabaseConfigured) ? 'not-allowed' : 'pointer',
              }}>
                {sending ? 'Sending…' : '✉ Send sign-in link'}
              </button>
            </div>
          </form>
        )}
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
const btnGhost = {
  padding: '8px 14px', fontSize: 12,
  background: 'transparent', color: '#666', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
const linkBtn = {
  background: 'none', border: 'none', color: '#888', textDecoration: 'underline',
  cursor: 'pointer', padding: 0, fontSize: 11,
};
const warnStyle = {
  padding: '8px 10px', marginBottom: 14,
  background: '#1a1408', border: '1px solid #3a2a10',
  color: '#f6c90e', fontSize: 11, borderRadius: 5,
};
const errStyle = {
  padding: '8px 10px', marginTop: 4,
  background: '#1a0808', border: '1px solid #5a1a1a',
  color: '#e05c5c', fontSize: 11, borderRadius: 5,
};
