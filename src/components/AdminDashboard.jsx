import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../utils/supabase';
import { PREMIUM_FEATURES, FREE_FEATURES } from '../utils/premium';

const PW_KEY = 'admin-password-v1';

export default function AdminDashboard() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(PW_KEY) || '');
  const [pwInput, setPwInput] = useState('');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');

  const load = async (pw) => {
    if (!isSupabaseConfigured) {
      setError('Supabase not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [statsRes, usersRes] = await Promise.all([
        supabase.rpc('get_stats_admin', { p_password: pw }),
        supabase.rpc('get_users_admin', { p_password: pw }),
      ]);
      if (statsRes.error) throw new Error(statsRes.error.message);
      if (usersRes.error) throw new Error(usersRes.error.message);
      setStats(Array.isArray(statsRes.data) ? statsRes.data[0] : statsRes.data);
      setUsers(usersRes.data || []);
      sessionStorage.setItem(PW_KEY, pw);
      setPassword(pw);
    } catch (err) {
      setError(err.message || 'Failed to load');
      sessionStorage.removeItem(PW_KEY);
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (password) load(password);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = () => {
    sessionStorage.removeItem(PW_KEY);
    setPassword('');
    setStats(null);
    setUsers([]);
    setPwInput('');
    setError(null);
  };

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.phone || '').toLowerCase().includes(q);
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortBy], bv = b[sortBy];
    if (av == null) return 1;
    if (bv == null) return -1;
    const dir = sortDir === 'asc' ? 1 : -1;
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });

  const exportCSV = () => {
    const headers = ['email', 'phone', 'created_at', 'last_used_at', 'app_use_count', 'photobook_count'];
    const rows = [headers.join(',')];
    for (const u of users) {
      rows.push(headers.map((h) => `"${String(u[h] ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photobook-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Login screen ─────────────────────────────────────────────────
  if (!password || !stats) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#e8e8e8', marginBottom: 6 }}>
            Admin Dashboard
          </div>
          <div style={{ fontSize: 12, color: '#777', marginBottom: 18 }}>
            Enter the admin password to view signups and stats.
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (pwInput.trim()) load(pwInput.trim()); }}>
            <input
              type="password" autoFocus
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              placeholder="Admin password"
              style={inputStyle}
            />
            {error && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: '#1a0808', border: '1px solid #5a1a1a', color: '#e05c5c', fontSize: 11, borderRadius: 5 }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading || !pwInput.trim()} style={{
              ...btnPrimary, marginTop: 14, width: '100%',
              opacity: loading || !pwInput.trim() ? 0.5 : 1,
            }}>
              {loading ? 'Checking…' : 'Sign in'}
            </button>
          </form>
          <a href="/" style={{
            display: 'inline-block', marginTop: 12, fontSize: 11, color: '#555',
            textDecoration: 'none',
          }}>← Back to app</a>
        </div>
      </div>
    );
  }

  // ── Dashboard ────────────────────────────────────────────────────
  return (
    <div style={{ ...pageStyle, alignItems: 'stretch', justifyContent: 'flex-start' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px', borderBottom: '1px solid #1a1a1a', background: '#0c0c0c',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="./logo.png" alt="" style={{ height: 26, width: 26, borderRadius: '50%' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#ddd' }}>Admin Dashboard</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => load(password)} style={btnGhost} title="Refresh">↻ Refresh</button>
          <button onClick={exportCSV} style={btnGhost}>↓ Export CSV</button>
          <a href="/" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>← App</a>
          <button onClick={logout} style={{ ...btnGhost, color: '#e05c5c', borderColor: '#3a1a1a' }}>Sign out</button>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ padding: '20px 24px 8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <StatCard label="Total signups" value={stats.total_users} accent="#4f8ef7" />
        <StatCard label="Premium users" value={stats.total_premium} accent="#f6c90e" />
        <StatCard label="Photobooks created" value={stats.total_photobooks} accent="#6fcf97" />
        <StatCard label="App sessions" value={stats.total_app_uses} accent="#b89fff" />
        <StatCard label="Signups · 7d" value={stats.signups_last_7d} accent="#d4843a" />
        <StatCard label="Signups · 30d" value={stats.signups_last_30d} accent="#e05c5c" />
      </div>

      {/* Table */}
      <div style={{ padding: '8px 24px 24px', flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <input
            type="text" placeholder="Search email or phone…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, maxWidth: 320 }}
          />
          <span style={{ fontSize: 11, color: '#666' }}>{sorted.length} of {users.length}</span>
        </div>

        <div style={{ background: '#111', borderRadius: 8, overflow: 'hidden', border: '1px solid #1a1a1a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0c0c0c' }}>
                {[
                  ['email', 'Email'],
                  ['tier', 'Tier'],
                  ['phone', 'Phone'],
                  ['photobook_count', 'Photobooks'],
                  ['app_use_count', 'Sessions'],
                  ['last_used_at', 'Last used'],
                  ['created_at', 'Joined'],
                ].map(([key, label]) => (
                  <th key={key}
                    onClick={() => {
                      if (sortBy === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
                      else { setSortBy(key); setSortDir('desc'); }
                    }}
                    style={{
                      textAlign: 'left', padding: '10px 12px',
                      color: '#888', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                      cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid #1a1a1a',
                      fontWeight: 600,
                    }}>
                    {label} {sortBy === key && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#555' }}>
                  {users.length === 0 ? 'No signups yet.' : 'No matches.'}
                </td></tr>
              )}
              {sorted.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #161616' }}>
                  <td style={cellStyle}>{u.email}</td>
                  <td style={cellStyle}>
                    <button
                      onClick={async () => {
                        const next = u.tier === 'premium' ? 'free' : 'premium';
                        if (!confirm(`Change ${u.email} from ${u.tier} to ${next}?`)) return;
                        try {
                          const { error } = await supabase.rpc('set_user_tier_admin', {
                            p_password: password, p_user_id: u.id, p_tier: next,
                          });
                          if (error) throw new Error(error.message);
                          await load(password);
                        } catch (err) { alert(err.message); }
                      }}
                      style={{
                        padding: '2px 8px', fontSize: 10, fontWeight: 600,
                        background: u.tier === 'premium' ? '#3a2a08' : '#181818',
                        color: u.tier === 'premium' ? '#f6c90e' : '#888',
                        border: `1px solid ${u.tier === 'premium' ? '#5a4010' : '#2a2a2a'}`,
                        borderRadius: 3, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase',
                      }}
                      title="Click to toggle tier"
                    >
                      {u.tier === 'premium' ? '✦ Premium' : 'Free'}
                    </button>
                  </td>
                  <td style={{ ...cellStyle, color: '#888' }}>{u.phone || '—'}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: '#6fcf97' }}>{u.photobook_count}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: '#b89fff' }}>{u.app_use_count}</td>
                  <td style={{ ...cellStyle, color: '#888' }}>{formatDate(u.last_used_at)}</td>
                  <td style={{ ...cellStyle, color: '#666' }}>{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Feature catalogue */}
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
              Feature gating reference
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 10, color: '#f6c90e', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  ✦ Premium unlocks
                </div>
                {PREMIUM_FEATURES.map((f) => (
                  <div key={f.key} style={{ marginBottom: 8, fontSize: 12 }}>
                    <div style={{ color: '#ddd' }}>· {f.name}</div>
                    <div style={{ color: '#666', fontSize: 11, marginLeft: 10 }}>{f.detail}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 10, color: '#6fcf97', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  Always free
                </div>
                {FREE_FEATURES.map((f) => (
                  <div key={f.key} style={{ marginBottom: 8, fontSize: 12 }}>
                    <div style={{ color: '#ddd' }}>· {f.name}</div>
                    <div style={{ color: '#666', fontSize: 11, marginLeft: 10 }}>{f.detail}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: '#555', lineHeight: 1.5 }}>
              Per-user tier is toggled via the <b style={{ color: '#888' }}>Tier</b> column above.
              The feature catalogue is read from <code style={{ color: '#888' }}>src/utils/premium.js</code> —
              edit that file to add/remove items, then redeploy.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: '#111', border: '1px solid #1a1a1a', borderRadius: 8,
      padding: '14px 16px', borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 10, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: '#e8e8e8', fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

// ── styles ────────────────────────────────────────────────────────
const pageStyle = {
  position: 'fixed', inset: 0,
  background: '#0d0d0d',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#e0e0e0',
  overflow: 'auto',
};

const cardStyle = {
  background: '#111', border: '1px solid '+'#1f1f1f',
  borderRadius: 10, padding: '28px 30px',
  width: 360, maxWidth: '92vw',
  boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
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
  padding: '6px 12px', fontSize: 11,
  background: '#181818', color: '#bbb',
  border: '1px solid #2a2a2a', borderRadius: 5, cursor: 'pointer',
};

const cellStyle = {
  padding: '10px 12px', color: '#ccc', fontSize: 12,
  borderBottom: 'none',
};
