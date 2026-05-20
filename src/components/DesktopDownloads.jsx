// Mac + Windows download cards. Auto-highlights the user's platform.
// URLs come from env vars so they can point at cPanel paths, a CDN,
// or GitHub Releases without code changes.

const MAC_URL =
  import.meta.env.VITE_DESKTOP_MAC_URL || '/downloads/AutoBook-mac.dmg';
const WIN_URL =
  import.meta.env.VITE_DESKTOP_WINDOWS_URL || '/downloads/AutoBook-windows.exe';

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  const p = (navigator.userAgentData?.platform || navigator.platform || '').toLowerCase();
  if (/mac/.test(p)) return 'mac';
  if (/win/.test(p)) return 'win';
  return 'other';
}

export default function DesktopDownloads({ compact = false }) {
  const platform = detectPlatform();

  return (
    <div style={{
      background: '#0c0c0c',
      border: '1px solid #1f1f1f',
      borderRadius: 8,
      padding: compact ? '14px 16px' : '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>
            Use AutoBook offline
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.5 }}>
            Install the desktop app — same editor, same projects, no internet needed once installed.
          </div>
        </div>
        <span style={{ fontSize: 9, color: '#6fcf97', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          v1.0
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 14 }}>
        <DownloadCard
          label="macOS"
          sublabel="Apple Silicon · Intel"
          icon=""
          url={MAC_URL}
          recommended={platform === 'mac'}
        />
        <DownloadCard
          label="Windows"
          sublabel="64-bit · installer"
          icon="⊞"
          url={WIN_URL}
          recommended={platform === 'win'}
        />
      </div>

      <div style={{ fontSize: 10, color: '#555', marginTop: 12, lineHeight: 1.5 }}>
        Your projects sync via your AutoBook account — sign in on either platform and your books follow you.
      </div>
    </div>
  );
}

function DownloadCard({ label, sublabel, icon, url, recommended }) {
  return (
    <a
      href={url}
      download
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px',
        background: recommended ? '#0e1a26' : '#161616',
        border: `1px solid ${recommended ? '#2a4a6a' : '#252525'}`,
        borderRadius: 6,
        color: '#e0e0e0',
        textDecoration: 'none',
        transition: 'all 120ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a5a7a'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = recommended ? '#2a4a6a' : '#252525'; }}
    >
      <span style={{
        fontSize: 22, fontWeight: 700,
        color: recommended ? '#6fb8d8' : '#888',
        width: 28, textAlign: 'center', lineHeight: 1,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8e8' }}>
          {label}
          {recommended && (
            <span style={{
              fontSize: 8, marginLeft: 6,
              color: '#6fcf97', background: '#0e1a10',
              border: '1px solid #2a4a2a',
              padding: '1px 5px', borderRadius: 2,
              letterSpacing: 0.5, textTransform: 'uppercase', verticalAlign: 'middle',
            }}>
              Your OS
            </span>
          )}
        </div>
        <div style={{ fontSize: 10, color: '#777', marginTop: 2 }}>
          {sublabel}
        </div>
      </div>
      <span style={{ fontSize: 14, color: recommended ? '#6fb8d8' : '#666' }}>↓</span>
    </a>
  );
}
