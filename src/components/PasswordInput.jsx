import { useState } from 'react';

// Drop-in replacement for <input type="password" /> with an eye-icon
// toggle on the right side. Forwards every other prop straight to the
// underlying input so callers keep using their existing styles and
// validators (required / minLength / autoFocus / etc.).
//
// Usage:
//   <PasswordInput value={pw} onChange={(e) => setPw(e.target.value)}
//                  required minLength={8} placeholder="At least 8 chars"
//                  style={existingInputStyle} />
export default function PasswordInput({ style, ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type={visible ? 'text' : 'password'}
        style={{ ...style, paddingRight: 38 }}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        title={visible ? 'Hide password' : 'Show password'}
        aria-label={visible ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: 4, top: '50%',
          transform: 'translateY(-50%)',
          background: 'none', border: 'none',
          padding: '6px 8px', cursor: 'pointer',
          lineHeight: 0,
          color: '#888',
          opacity: 0.8,
        }}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

// Classic eye outline — almond shape with a pupil.
function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// Same eye with a diagonal slash through it.
function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <line x1="4" y1="20" x2="20" y2="4" />
    </svg>
  );
}
