import { useState } from 'react';
import { sendMagicLink, signInWithPassword, signUpWithPassword, isSupabaseConfigured } from '../utils/supabase';

// Sign-in / sign-up modal:
//   - "Sign in" tab: existing users — email + password
//   - "Sign up" tab: new users — email + password (+ optional phone).
//     Auto-confirmed at the DB level (see SUPABASE_DEFAULT_PASSWORD.sql)
//     so the user is signed in immediately and can pay right away.
//   - "Email me a sign-in link" link in both tabs (fallback for users
//     who forgot their password or prefer magic-link).
//
// `onAuthed` (optional): called after a successful sign-in OR sign-up.
// Callers like UpgradeModal use this to resume a pending payment action.
export default function AuthModal({ open, onClose, action, onAuthed }) {
  // 'signup' is the default for first-time visitors hitting a paywall
  // (the most common pattern); existing users tap "Sign in".
  const [mode, setMode] = useState(action === 'signin' ? 'signin' : 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);     // magic-link confirmation
  const [error, setError] = useState(null);

  if (!open) return null;

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const canSubmit  = validEmail && password.length >= 8 && !pending;

  const finishAuth = () => {
    if (onAuthed) onAuthed(); // resume pending action (e.g. pay)
    onClose();
  };

  const submitSignIn = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true); setError(null);
    try {
      await signInWithPassword(email, password);
      finishAuth();
    } catch (err) {
      setError(err.message || 'Sign-in failed.');
    } finally {
      setPending(false);
    }
  };

  const submitSignUp = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true); setError(null);
    try {
      await signUpWithPassword(email, password, phone || null);
      finishAuth();
    } catch (err) {
      setError(err.message || 'Sign-up failed.');
    } finally {
      setPending(false);
    }
  };

  const sendLinkFallback = async () => {
    if (!validEmail) { setError('Type your email above first.'); return; }
    setPending(true); setError(null);
    try {
      await sendMagicLink(email, phone || null);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Could not send link. Try again.');
    } finally {
      setPending(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError(null);
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
        width: 420, maxWidth: '94vw',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {sent
            ? 'Check your email'
            : action === 'save' ? 'Sign in to save your work'
            : action === 'export' ? 'Sign in to export'
            : 'Sign in'}
        </div>

        {!isSupabaseConfigured && (
          <div style={warnStyle}>
            ⚠ Backend not configured. Owner: see <code>SUPABASE_AUTH_SETUP.md</code>.
          </div>
        )}

        {/* Mode tabs */}
        {!sent && (
          <div style={{
            display: 'flex', gap: 0, marginBottom: 16, marginTop: 12,
            borderBottom: '1px solid #1f1f1f',
          }}>
            <Tab active={mode === 'signin'} onClick={() => switchMode('signin')}>
              Sign in
            </Tab>
            <Tab active={mode === 'signup'} onClick={() => switchMode('signup')}>
              Sign up
            </Tab>
          </div>
        )}

        {sent ? (
          <div style={{ padding: '4px 0' }}>
            <div style={{ fontSize: 13, color: '#6fcf97', marginBottom: 10 }}>
              ✓ Sign-in link sent to <b style={{ color: '#ddd' }}>{email}</b>
            </div>
            <div style={{ fontSize: 12, color: '#888', lineHeight: 1.6 }}>
              Open the email on this device and click the link. The link
              expires in 1 hour.
            </div>
            <div style={{ fontSize: 11, color: '#555', marginTop: 12 }}>
              Wrong email?{' '}
              <button onClick={() => { setSent(false); setEmail(''); setPassword(''); setPhone(''); }} style={linkBtn}>
                Try another
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={mode === 'signin' ? submitSignIn : submitSignUp}>
            {mode === 'signup' && (
              <div style={{ fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 1.55 }}>
                Pick any email + password. You'll be signed in immediately —
                no inbox round-trip.
              </div>
            )}

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={labelStyle}>Email</span>
              <input
                type="email" autoFocus required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'block', marginBottom: mode === 'signup' ? 12 : 14 }}>
              <span style={labelStyle}>Password</span>
              <input
                type="password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={inputStyle}
              />
            </label>
            {mode === 'signup' && (
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={labelStyle}>Phone <span style={{ textTransform: 'none', color: '#444' }}>(optional)</span></span>
                <input
                  type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  style={inputStyle}
                />
              </label>
            )}

            {error && <div style={errStyle}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, alignItems: 'center' }}>
              <button type="button" onClick={sendLinkFallback} disabled={pending}
                style={{ ...linkBtn, marginRight: 'auto' }}>
                {mode === 'signin' ? 'Forgot password? Email me a link' : 'Email me a sign-in link instead'}
              </button>
              <button type="button" onClick={onClose} disabled={pending} style={btnGhost}>
                Cancel
              </button>
              <button type="submit" disabled={!canSubmit || !isSupabaseConfigured} style={{
                ...btnPrimary,
                opacity: (!canSubmit || !isSupabaseConfigured) ? 0.5 : 1,
                cursor: (!canSubmit || !isSupabaseConfigured) ? 'not-allowed' : 'pointer',
              }}>
                {pending
                  ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
                  : (mode === 'signin' ? 'Sign in' : 'Create account')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '8px 14px',
      background: 'none', border: 'none',
      color: active ? '#ddd' : '#666',
      fontSize: 12, fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      borderBottom: `2px solid ${active ? '#4f8ef7' : 'transparent'}`,
      marginBottom: -1,
    }}>
      {children}
    </button>
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
  borderRadius: 5,
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
