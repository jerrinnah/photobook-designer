import { useState } from 'react';
import { getStoredUser } from '../utils/supabase';

// Lightweight support contact dialog. Pre-fills a mailto: link with
// the user's input plus a hidden block of diagnostic info (browser,
// account email, current page) so the support inbox can triage fast.
// No backend endpoint required — opens the user's default mail client.

const SUPPORT_EMAIL = 'support@autobookbynej.online';

export default function SupportModal({ open, onClose }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  if (!open) return null;

  const user = getStoredUser();
  const diagnostics = [
    user?.email && `Account: ${user.email}`,
    user?.tier && `Tier: ${user.tier}`,
    `Browser: ${navigator.userAgent}`,
    `Page: ${window.location.href}`,
    `Time: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  const composedSubject = subject.trim() || 'AutoBook support';
  const composedBody = [
    body.trim(),
    '',
    '— — — — — — — — — — — — — — — —',
    '(diagnostic info — please leave this)',
    diagnostics,
  ].join('\n');

  const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(composedSubject)}&body=${encodeURIComponent(composedBody)}`;

  const handleOpenMail = () => {
    window.location.href = mailtoUrl;
    // Give the mail client a moment to open before closing the modal
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
        width: 460, maxWidth: '94vw',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6, color: '#e8e8e8' }}>
          Contact support
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 18, lineHeight: 1.55 }}>
          Tell us what's going wrong or what you need. We respond within one business day.
          Your message opens in your email app — we never store it on our servers.
        </div>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={labelStyle}>Subject</span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What's this about?"
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
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>

        <div style={{
          fontSize: 10, color: '#555', marginBottom: 14,
          padding: '8px 10px', background: '#0c0c0c',
          border: '1px solid #1a1a1a', borderRadius: 4, lineHeight: 1.5,
        }}>
          We'll automatically attach: your browser, account email, and current page —
          so support doesn't have to ask. Nothing else.
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button onClick={handleCopyEmail} style={{
            ...btnGhost, marginRight: 'auto', fontSize: 11,
          }}>
            Copy {SUPPORT_EMAIL}
          </button>
          <button onClick={onClose} style={btnGhost}>Cancel</button>
          <button onClick={handleOpenMail} style={btnPrimary}>
            ✉ Open in email
          </button>
        </div>
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
