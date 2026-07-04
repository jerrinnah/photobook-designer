import { useState } from 'react';
import { getStoredUser, rpcDirect } from '../utils/supabase';

// Support contact dialog. Primary path: submit to the support_tickets
// table via submit_support_ticket RPC so it lands in the admin
// dashboard. Fallback: mailto: link for users whose network can't reach
// Supabase (offline, blocked corporate proxy, etc.) or before the
// SUPABASE_SUPPORT_TICKETS.sql migration has been run.

const SUPPORT_EMAIL = 'support@autobookbynej.online';

export default function SupportModal({ open, onClose }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState(''); // only shown when user isn't signed in
  const [state, setState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [errMsg, setErrMsg] = useState('');
  if (!open) return null;

  const user = getStoredUser();
  const composedSubject = subject.trim() || 'AutoBook support';

  const diagnostics = [
    user?.email && `Account: ${user.email}`,
    user?.tier && `Tier: ${user.tier}`,
    `Browser: ${navigator.userAgent}`,
    `Page: ${window.location.href}`,
    `Time: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  const composedBody = [
    body.trim(),
    '',
    '— — — — — — — — — — — — — — — —',
    '(diagnostic info — please leave this)',
    diagnostics,
  ].join('\n');

  const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(composedSubject)}&body=${encodeURIComponent(composedBody)}`;

  const handleSend = async () => {
    if (state === 'sending') return;
    setErrMsg('');
    if (!subject.trim()) { setErrMsg('Please add a subject.'); return; }
    if (!body.trim())    { setErrMsg('Please describe what you need help with.'); return; }
    if (!user?.email && !email.trim()) {
      setErrMsg('Please enter an email so we can reply.');
      return;
    }
    setState('sending');
    try {
      await rpcDirect('submit_support_ticket', {
        p_subject:  subject.trim(),
        p_body:     body.trim(),
        p_email:    user?.email ? null : email.trim(), // server prefers signed-in email
        p_browser:  (navigator.userAgent || '').slice(0, 500),
        p_page_url: window.location.href.slice(0, 500),
      }, {
        label: 'Support',
        timeoutMs: 15_000,
        useUserToken: Boolean(user?.email),
      });
      setState('sent');
      setTimeout(onClose, 2000);
    } catch (e) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('could not find the function') || msg.includes('404')) {
        setErrMsg("Support routing isn't installed yet. Falling back to email — click Open in email below.");
      } else {
        setErrMsg(e?.message || 'Could not send. Try email fallback below.');
      }
      setState('error');
    }
  };

  const handleOpenMail = () => {
    window.location.href = mailtoUrl;
    setTimeout(onClose, 500);
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      alert(`Copied ${SUPPORT_EMAIL} to clipboard`);
    } catch {
      prompt('Copy this email:', SUPPORT_EMAIL);
    }
  };

  const sent = state === 'sent';

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
        width: 480, maxWidth: '94vw',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: '#e8e8e8' }}>
          Contact support
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 18, lineHeight: 1.55 }}>
          Tell us what's going wrong or what you need. Your message goes directly to our team's
          dashboard — we usually respond within one business day.
        </div>

        {sent ? (
          <div style={{
            padding: '18px 16px',
            background: '#0e1a10', border: '1px solid #2a4a2a',
            borderRadius: 6, color: '#6fcf97',
            fontSize: 13, lineHeight: 1.6, textAlign: 'center',
          }}>
            ✓ Your message was sent. We'll email you back at{' '}
            <b>{user?.email || email}</b>.
          </div>
        ) : (
          <>
            {!user?.email && (
              <label style={{ display: 'block', marginBottom: 12 }}>
                <span style={labelStyle}>Your email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com — so we can reply"
                  style={inputStyle}
                />
              </label>
            )}

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={labelStyle}>Subject</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What's this about?"
                maxLength={200}
                style={inputStyle}
              />
            </label>

            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={labelStyle}>Message</span>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Describe the issue, what you were doing, anything that might help us reproduce it…"
                rows={6}
                maxLength={5000}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </label>

            <div style={{
              fontSize: 10, color: '#555', marginBottom: 14,
              padding: '8px 10px', background: '#0c0c0c',
              border: '1px solid #1a1a1a', borderRadius: 4, lineHeight: 1.5,
            }}>
              We'll automatically attach: browser, {user?.email ? 'account email' : 'the email you provided'}, and current page —
              so support doesn't have to ask. Nothing else.
            </div>

            {errMsg && (
              <div style={{
                fontSize: 11, color: '#e05c5c', marginBottom: 12,
                padding: '8px 10px', background: '#1a0808',
                border: '1px solid #5a1a1a', borderRadius: 4, lineHeight: 1.5,
              }}>
                {errMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
              <button onClick={handleCopyEmail} style={{
                ...btnGhost, marginRight: 'auto', fontSize: 11,
              }}>
                Copy {SUPPORT_EMAIL}
              </button>
              <button onClick={handleOpenMail} style={btnGhost} title="Open your local mail client instead">
                ✉ Email fallback
              </button>
              <button
                onClick={handleSend}
                disabled={state === 'sending'}
                style={{
                  ...btnPrimary,
                  opacity: state === 'sending' ? 0.6 : 1,
                  cursor: state === 'sending' ? 'wait' : 'pointer',
                }}
              >
                {state === 'sending' ? 'Sending…' : '↗ Send to support'}
              </button>
            </div>
          </>
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
  padding: '9px 16px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 5, cursor: 'pointer',
};
const btnGhost = {
  padding: '8px 14px', fontSize: 12,
  background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
