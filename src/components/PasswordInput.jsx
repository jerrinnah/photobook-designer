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
          right: 6, top: '50%',
          transform: 'translateY(-50%)',
          background: 'none', border: 'none',
          padding: '4px 6px', cursor: 'pointer',
          fontSize: 14, lineHeight: 1,
          color: '#888',
          opacity: 0.85,
        }}
      >
        {visible ? '🙈' : '👁'}
      </button>
    </div>
  );
}
