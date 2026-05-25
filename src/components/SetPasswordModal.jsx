import { useState, useEffect } from 'react';
import { setMyPassword } from '../utils/supabase';
import PasswordInput from './PasswordInput';

// Lets a signed-in user set or change their password so they don't
// have to wait for a magic link on every visit.
export default function SetPasswordModal({ open, onClose }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setPassword(''); setConfirm('');
      setSaving(false); setDone(false); setError(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = async (e) => {
    e?.preventDefault?.();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    try {
      await setMyPassword(password);
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      // setMyPassword now logs full error to console; surface the
      // message inline so the user sees something specific instead
      // of just a stalled spinner.
      console.error('[SetPasswordModal] save failed', err);
      setError(err.message || 'Could not update password. Open the browser console for details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 210,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', border: '1px solid #1f1f1f',
        borderRadius: 10, padding: '24px 28px',
        width: 380, maxWidth: '92vw',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
          {done ? 'Password saved' : 'Set a password'}
        </div>
        {!done && (
          <div style={{ fontSize: 12, color: '#888', marginBottom: 18, lineHeight: 1.55 }}>
            Skip the magic link next time. Your password is encrypted and stored by
            Supabase Auth — we never see it.
          </div>
        )}

        {done ? (
          <div style={{ padding: '8px 0 4px' }}>
            <div style={{ fontSize: 13, color: '#6fcf97' }}>
              ✓ Password updated. You can now sign in with email + password.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={labelStyle}>New password</span>
              <PasswordInput
                autoFocus required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelStyle}>Confirm password</span>
              <PasswordInput
                required minLength={8}
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                style={inputStyle}
              />
            </label>

            {error && <div style={errStyle}>{error}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={onClose} disabled={saving} style={btnGhost}>Cancel</button>
              <button type="submit" disabled={saving || password.length < 8 || password !== confirm} style={{
                ...btnPrimary,
                opacity: (saving || password.length < 8 || password !== confirm) ? 0.5 : 1,
                cursor: (saving || password.length < 8 || password !== confirm) ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Saving…' : 'Save password'}
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
  borderRadius: 5,
};
const btnGhost = {
  padding: '8px 14px', fontSize: 12,
  background: 'transparent', color: '#666', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
const errStyle = {
  padding: '8px 10px', marginTop: 4,
  background: '#1a0808', border: '1px solid #5a1a1a',
  color: '#e05c5c', fontSize: 11, borderRadius: 5,
};
