// Mac + Windows download cards, gated by tier.
//
// Paid (Pro / Starter) or Trial users can download. Free / signed-out
// visitors see a locked panel that explains why and links to the
// upgrade modal. Once they install the desktop app and sign in, their
// tier follows them — the desktop app shares the same Supabase backend
// so the access level mirrors the web account exactly.

import { useAuthUser } from '../utils/supabase';
import { getEffectiveTier, hasPremiumAccess } from '../utils/premium';

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

export default function DesktopDownloads({ compact = false, onUpgradeClick }) {
  const user = useAuthUser();
  const tier = getEffectiveTier(user);
  const platform = detectPlatform();
  const canDownload = Boolean(user?.email) && hasPremiumAccess(tier);

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

      {canDownload ? (
        <>
          {/* Tier indicator — reassure user the desktop app respects their plan */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            marginTop: 12, padding: '4px 10px',
            background: '#0e1a10', border: '1px solid #2a4a2a',
            borderRadius: 4, fontSize: 10, color: '#6fcf97',
          }}>
            <span style={{ fontSize: 11 }}>●</span>
            <span style={{ fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {tier === 'pro' ? 'Pro access' : tier === 'starter' ? 'Starter access' : 'Trial access'}
            </span>
            <span style={{ color: '#aaa' }}>— same features as web</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginTop: 12 }}>
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
            Sign in to the desktop app with the same email — your projects and {tier} access follow you across devices.
          </div>
        </>
      ) : (
        <LockedPanel
          isSignedIn={Boolean(user?.email)}
          onUpgradeClick={onUpgradeClick}
        />
      )}
    </div>
  );
}

function LockedPanel({ isSignedIn, onUpgradeClick }) {
  return (
    <div style={{
      marginTop: 12, padding: '12px 14px',
      background: '#1a1408', border: '1px solid #3a2a10',
      borderRadius: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: '#f6c90e' }}>🔒</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#f6c90e' }}>
          Paid plan required for the desktop app
        </span>
      </div>
      <div style={{ fontSize: 11, color: '#aaa', lineHeight: 1.55, marginBottom: 10 }}>
        {isSignedIn
          ? 'The offline app is a Pro, Starter, or Trial feature. Upgrade and the same email unlocks the desktop installer.'
          : 'Sign in first, then upgrade to Pro, Starter, or start a trial — the desktop app mirrors your plan automatically.'}
      </div>
      {onUpgradeClick && (
        <button onClick={onUpgradeClick} style={{
          padding: '7px 14px', fontSize: 11, fontWeight: 600,
          background: '#3a2a08', color: '#f6c90e',
          border: '1px solid #5a4010', borderRadius: 4,
          cursor: 'pointer',
        }}>
          ✦ See plans
        </button>
      )}
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
