import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured, supabaseUrl, supabaseAnonKey, rpcDirect } from '../utils/supabase';
import PasswordInput from './PasswordInput';
import { PREMIUM_FEATURES, FREE_FEATURES } from '../utils/premium';

const PW_KEY = 'admin-password-v1';

export default function AdminDashboard() {
  const [password, setPassword] = useState(() => sessionStorage.getItem(PW_KEY) || '');
  const [pwInput, setPwInput] = useState('');
  const [stats, setStats] = useState(null);
  const [overview, setOverview] = useState(null); // new richer overview (revenue, sparkline, tier mix)
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set()); // emails of bulk-selected rows
  const [detailEmail, setDetailEmail] = useState(null); // open drawer for this user
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'users' | 'payments' | 'referrals' | 'settings'
  const [referrals, setReferrals] = useState(null);

  const load = async (pw) => {
    if (!isSupabaseConfigured) {
      setError('Supabase not configured.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const statsData = await rpcDirect('get_stats_admin', { p_password: pw }, { label: 'Stats', timeoutMs: 30_000 });
      const statsRow = Array.isArray(statsData) ? statsData[0] : statsData;
      if (statsRow == null) {
        throw new Error("Wrong password. (Or the admin RPCs aren't installed — run SUPABASE_ADMIN_RPC.sql.)");
      }
      const usersData = await rpcDirect('get_users_admin', { p_password: pw }, { label: 'Users', timeoutMs: 30_000 });
      setStats(statsRow);
      setUsers(Array.isArray(usersData) ? usersData : []);
      sessionStorage.setItem(PW_KEY, pw);
      setPassword(pw);

      // Fetch the richer overview separately — don't block sign-in if
      // the optional RPC isn't installed yet.
      rpcDirect('get_overview_admin', { p_password: pw }, { label: 'Overview', timeoutMs: 15_000 })
        .then((o) => setOverview(o))
        .catch((e) => console.info('[Admin] overview RPC not installed yet (run SUPABASE_ADMIN_OVERVIEW.sql):', e?.message));
    } catch (err) {
      console.error('[AdminDashboard.load] failed', err);
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

  // Lazy-load referrals when that tab is first opened (avoids extra
  // RPC for admins who never visit it).
  useEffect(() => {
    if (activeTab === 'referrals' && password && !referrals) {
      rpcDirect('get_referrals_admin', { p_password: password }, { label: 'Referrals', timeoutMs: 15_000 })
        .then((r) => setReferrals(r))
        .catch((e) => console.warn('[Admin] referrals RPC failed:', e.message));
    }
  }, [activeTab, password, referrals]);

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
            <PasswordInput
              autoFocus
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
  const tabs = [
    { key: 'overview',  label: 'Overview',  icon: '⌂' },
    { key: 'users',     label: 'Users',     icon: '◉', badge: users.length },
    { key: 'payments',  label: 'Payments',  icon: '◰' },
    { key: 'referrals', label: 'Referrals', icon: '↺' },
    { key: 'settings',  label: 'Settings',  icon: '⚙' },
  ];

  return (
    <div style={{
      display: 'flex', height: '100vh', background: '#0a0a0a',
      color: '#e0e0e0', fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* ── Sidebar ───────────────────────────────────────────── */}
      <aside style={{
        width: 220, flexShrink: 0,
        background: '#0c0c0c', borderRight: '1px solid #1a1a1a',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 18px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="./logo.png" alt="" style={{ height: 28, width: 28, borderRadius: 6 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>
            AutoBook
          </span>
          <span style={{ fontSize: 9, color: '#666', marginLeft: 'auto', letterSpacing: 1 }}>ADMIN</span>
        </div>
        <nav style={{ padding: '8px 10px', flex: 1 }}>
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                width: '100%', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', marginBottom: 2,
                background: activeTab === t.key ? '#1a3580' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#aaa',
                border: 'none', borderRadius: 6,
                fontSize: 12, fontWeight: activeTab === t.key ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{t.icon}</span>
              <span>{t.label}</span>
              {t.badge != null && t.badge > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 9, padding: '1px 6px',
                  background: activeTab === t.key ? 'rgba(255,255,255,0.18)' : '#1a1a1a',
                  color: activeTab === t.key ? '#fff' : '#888',
                  borderRadius: 8, fontWeight: 600,
                }}>{t.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Upsell-style card — keeps the inspiration's friendly bottom card */}
        <div style={{
          margin: '10px 12px 12px',
          padding: '14px 12px',
          background: 'linear-gradient(135deg, #1a3580 0%, #0e1a3d 100%)',
          borderRadius: 10,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
            Share AutoBook
          </div>
          <div style={{ fontSize: 10, color: '#9fb8d8', lineHeight: 1.45, marginBottom: 10 }}>
            Refer photographers — earn 20% off your next plan per conversion.
          </div>
          <button onClick={() => setActiveTab('referrals')}
            style={{
              width: '100%', padding: '6px 10px',
              fontSize: 10, fontWeight: 600,
              background: '#fff', color: '#1a3580',
              border: 'none', borderRadius: 5, cursor: 'pointer',
            }}>
            View referrals →
          </button>
        </div>

        <div style={{ padding: '10px 12px 14px', borderTop: '1px solid #161616' }}>
          <a href="/" style={navFootBtn}>← Back to app</a>
          <button onClick={logout} style={{ ...navFootBtn, color: '#e05c5c' }}>Sign out</button>
        </div>
      </aside>

      {/* ── Main panel ─────────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 26px', borderBottom: '1px solid #161616',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>
              {{
                overview: 'Overview',
                users: 'Users',
                payments: 'Payments',
                referrals: 'Referral program',
                settings: 'Settings',
              }[activeTab]}
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              {{
                overview: 'Revenue, growth, and what users are doing right now.',
                users: 'Search, manage tiers, reset passwords, and audit accounts.',
                payments: 'Every Paystack transaction across all currencies.',
                referrals: 'Top referrers + program performance.',
                settings: 'Feature gating, SQL setup, and admin tools.',
              }[activeTab]}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => load(password)} style={btnGhost} title="Refresh data">↻</button>
            <button onClick={exportCSV} style={btnGhost}>↓ Export CSV</button>
          </div>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '20px 26px 30px' }}>

      {activeTab === 'overview' && (<>
      {/* Top metric row — three KPIs with deltas. Falls back to the
          old count cards when SUPABASE_ADMIN_OVERVIEW.sql isn't
          installed yet. */}
      {overview ? (
        <>
          <div style={{ padding: '20px 24px 8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <MetricCard
              label="Revenue · 30d"
              value={`₦${Number(overview.revenue_30d_ngn || 0).toLocaleString()}`}
              delta={pctDelta(overview.revenue_30d_ngn, overview.revenue_prev_30d_ngn)}
              accent="#f6c90e"
            />
            <MetricCard
              label="Signups · 7d"
              value={overview.signups_7d}
              delta={pctDelta(overview.signups_7d, overview.signups_prev_7d)}
              accent="#4f8ef7"
            />
            <MetricCard
              label="Conversion"
              value={`${overview.conversion_pct}%`}
              hint={`${overview.paid_users} / ${overview.total_users} users on a paid plan`}
              accent="#6fcf97"
            />
          </div>
          <div style={{ padding: '8px 24px', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Sparkline data={overview.sparkline || []} label="Signups · last 30 days" />
            <TierMixDonut mix={overview.tier_mix || {}} />
          </div>
        </>
      ) : (
        <div style={{ padding: '20px 24px 8px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          <StatCard label="Total signups" value={stats.total_users} accent="#4f8ef7" />
          <StatCard label="Premium users" value={stats.total_premium} accent="#f6c90e" />
          <StatCard label="Photobooks created" value={stats.total_photobooks} accent="#6fcf97" />
          <StatCard label="App sessions" value={stats.total_app_uses} accent="#b89fff" />
          <StatCard label="Signups · 7d" value={stats.signups_last_7d} accent="#d4843a" />
          <StatCard label="Signups · 30d" value={stats.signups_last_30d} accent="#e05c5c" />
        </div>
      )}
      </>)}

      {activeTab === 'users' && (<>
      {/* Table */}
      <div style={{ padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <input
            type="text" placeholder="Search email or phone…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, flex: 1, maxWidth: 320 }}
          />
          <span style={{ fontSize: 11, color: '#666' }}>{sorted.length} of {users.length}</span>
        </div>

        {/* Grant tier to any email — even unverified ones */}
        <AddUserByEmail password={password} onAdded={() => load(password)} />

        {/* Bulk-action bar — appears only when 1+ rows are selected */}
        {selected.size > 0 && (
          <BulkActionBar
            count={selected.size}
            onClear={() => setSelected(new Set())}
            onSetTier={async (tier) => {
              if (!confirm(`Set ${selected.size} user${selected.size === 1 ? '' : 's'} to ${tier.toUpperCase()}?`)) return;
              for (const email of selected) {
                try {
                  await rpcDirect('set_tier_by_email_admin', {
                    p_password: password, p_email: email, p_tier: tier,
                  }, { label: 'Bulk set tier', timeoutMs: 15_000 });
                } catch (err) { alert(`Failed for ${email}: ${err.message}`); }
              }
              setSelected(new Set());
              await load(password);
            }}
            onDelete={async () => {
              if (!confirm(`Permanently delete ${selected.size} user${selected.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
              for (const email of selected) {
                try {
                  await rpcDirect('delete_user_admin', {
                    p_password: password, p_email: email,
                  }, { label: 'Bulk delete', timeoutMs: 15_000 });
                } catch (err) { alert(`Failed for ${email}: ${err.message}`); }
              }
              setSelected(new Set());
              await load(password);
            }}
          />
        )}

        <div style={{ background: '#111', borderRadius: 8, overflow: 'hidden', border: '1px solid #1a1a1a' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#0c0c0c' }}>
                <th style={{
                  textAlign: 'center', padding: '10px 8px', width: 32,
                  borderBottom: '1px solid #1a1a1a',
                }}>
                  <input type="checkbox"
                    checked={sorted.length > 0 && selected.size === sorted.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelected(new Set(sorted.map((u) => u.email)));
                      else setSelected(new Set());
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                {[
                  ['email', 'Email'],
                  ['verified', 'Status'],
                  ['tier', 'Tier'],
                  ['phone', 'Phone'],
                  ['photobook_count', 'Photobooks'],
                  ['app_use_count', 'Sessions'],
                  ['last_used_at', 'Last used'],
                  ['created_at', 'Joined'],
                  ['actions', 'Actions'],
                ].map(([key, label]) => (
                  <th key={key}
                    onClick={() => {
                      if (key === 'actions') return; // not sortable
                      if (sortBy === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
                      else { setSortBy(key); setSortDir('desc'); }
                    }}
                    style={{
                      textAlign: 'left', padding: '10px 12px',
                      color: '#888', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                      cursor: key === 'actions' ? 'default' : 'pointer',
                      userSelect: 'none', borderBottom: '1px solid #1a1a1a',
                      fontWeight: 600,
                    }}>
                    {label} {sortBy === key && key !== 'actions' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#555' }}>
                  {users.length === 0 ? 'No signups yet.' : 'No matches.'}
                </td></tr>
              )}
              {sorted.map((u) => (
                <tr key={u.email}
                  onClick={(e) => {
                    // Skip drawer open if user clicked checkbox / actions
                    if (e.target.closest('input,select,button,a')) return;
                    setDetailEmail(u.email);
                  }}
                  style={{
                    borderBottom: '1px solid #161616',
                    background: selected.has(u.email) ? '#0e1620' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                    <input type="checkbox"
                      checked={selected.has(u.email)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(u.email);
                        else next.delete(u.email);
                        setSelected(next);
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={cellStyle}>{u.email}</td>
                  <td style={cellStyle}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
                      padding: '2px 8px', borderRadius: 3,
                      background: u.verified ? '#0e1a10' : '#1a1408',
                      color:      u.verified ? '#6fcf97' : '#f6c90e',
                      border: `1px solid ${u.verified ? '#2a4a2a' : '#3a2a10'}`,
                    }}>
                      {u.verified ? '● Verified' : '○ Pending'}
                    </span>
                  </td>
                  <td style={cellStyle}>
                    <select
                      value={u.tier}
                      onChange={async (e) => {
                        const next = e.target.value;
                        if (next === u.tier) return;
                        if (!confirm(`Change ${u.email} from ${u.tier} to ${next}?`)) {
                          e.target.value = u.tier;
                          return;
                        }
                        try {
                          await rpcDirect('set_tier_by_email_admin', {
                            p_password: password, p_email: u.email, p_tier: next,
                          }, { label: 'Set tier', timeoutMs: 15_000 });
                          await load(password);
                        } catch (err) { alert(err.message); e.target.value = u.tier; }
                      }}
                      style={{
                        padding: '3px 8px', fontSize: 10, fontWeight: 600,
                        background:
                          u.tier === 'pro' ? '#3a2a08' :
                          u.tier === 'starter' ? '#0e2a3a' : '#181818',
                        color:
                          u.tier === 'pro' ? '#f6c90e' :
                          u.tier === 'starter' ? '#6fb8d8' : '#aaa',
                        border: `1px solid ${
                          u.tier === 'pro' ? '#5a4010' :
                          u.tier === 'starter' ? '#2a4a6a' : '#2a2a2a'
                        }`,
                        borderRadius: 3, cursor: 'pointer', letterSpacing: 0.5, textTransform: 'uppercase',
                      }}
                      title="Change tier"
                    >
                      <option value="free">Free</option>
                      <option value="starter">Starter</option>
                      <option value="pro">✦ Pro</option>
                    </select>
                  </td>
                  <td style={{ ...cellStyle, color: '#888' }}>{u.phone || '—'}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: '#6fcf97' }}>{u.photobook_count}</td>
                  <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: '#b89fff' }}>{u.app_use_count}</td>
                  <td style={{ ...cellStyle, color: '#888' }}>{formatDate(u.last_used_at)}</td>
                  <td style={{ ...cellStyle, color: '#666' }}>{formatDate(u.created_at)}</td>
                  <td style={cellStyle}>
                    <UserRowActions
                      email={u.email}
                      adminPassword={password}
                      verified={Boolean(u.verified)}
                      onChanged={() => load(password)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

        </div>
      </div>
      </>)}

      {activeTab === 'payments' && <PaymentsPanel activity={overview?.activity || []} />}
      {activeTab === 'referrals' && <ReferralsPanel data={referrals} />}

      {activeTab === 'settings' && (
        <div>
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
            Per-user tier is toggled via the <b style={{ color: '#888' }}>Tier</b> column in the Users tab.
            The feature catalogue is read from <code style={{ color: '#888' }}>src/utils/premium.js</code> —
            edit that file to add/remove items, then redeploy.
          </div>
        </div>
      )}

        </div>
      </main>

      {/* Row-click user detail drawer */}
      {detailEmail && (
        <UserDetailDrawer
          email={detailEmail}
          adminPassword={password}
          onClose={() => setDetailEmail(null)}
        />
      )}
    </div>
  );
}

function UserDetailDrawer({ email, adminPassword, onClose }) {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  useEffect(() => {
    let alive = true;
    rpcDirect('get_user_detail_admin', {
      p_password: adminPassword, p_email: email,
    }, { label: 'User detail', timeoutMs: 15_000 })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setLoadErr(e.message); });
    return () => { alive = false; };
  }, [email, adminPassword]);

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', borderLeft: '1px solid #1f1f1f',
        width: 480, maxWidth: '92vw', height: '100%',
        overflowY: 'auto', boxShadow: '-20px 0 40px rgba(0,0,0,0.5)',
        color: '#e0e0e0', padding: '20px 22px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{email}</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: '#666',
            fontSize: 18, cursor: 'pointer', padding: '4px 8px',
          }}>✕</button>
        </div>

        {!data && !loadErr && <div style={{ color: '#666', fontSize: 12 }}>Loading…</div>}
        {loadErr && (
          <div style={{
            padding: '10px 12px', background: '#1a0808', border: '1px solid #5a1a1a',
            color: '#e05c5c', fontSize: 11, borderRadius: 5,
          }}>
            {loadErr}<br />Did you install SUPABASE_ADMIN_OVERVIEW.sql?
          </div>
        )}

        {data && (
          <>
            <Section title="Account">
              <Field label="Tier" value={<span style={{ color: '#f6c90e' }}>{data.user.tier || 'free'}</span>} />
              <Field label="User ID" value={<code style={{ fontSize: 10, color: '#888' }}>{data.user.id}</code>} />
              <Field label="Phone" value={data.user.phone || '—'} />
              <Field label="Joined" value={formatDate(data.user.created_at)} />
              <Field label="Last used" value={formatDate(data.user.last_used_at)} />
              <Field label="Photobooks" value={data.user.photobook_count ?? 0} />
              <Field label="Sessions" value={data.user.app_use_count ?? 0} />
            </Section>

            <Section title="Auth">
              <Field label="Email confirmed" value={data.auth.email_confirmed_at ? formatDate(data.auth.email_confirmed_at) : <span style={{ color: '#e05c5c' }}>○ Pending</span>} />
              <Field label="Last sign-in" value={formatDate(data.auth.last_sign_in_at)} />
              <Field label="Banned" value={data.auth.banned_until ? <span style={{ color: '#e05c5c' }}>Until {formatDate(data.auth.banned_until)}</span> : '—'} />
              <Field label="Deleted" value={data.auth.deleted_at ? <span style={{ color: '#e05c5c' }}>Yes — {formatDate(data.auth.deleted_at)}</span> : '—'} />
            </Section>

            <Section title={`Payments (${data.payments.length})`}>
              {data.payments.length === 0 ? (
                <div style={{ color: '#555', fontSize: 11 }}>No payments yet.</div>
              ) : (
                data.payments.map((p) => (
                  <div key={p.reference} style={{
                    padding: '8px 10px', marginBottom: 6,
                    background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 5,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 13, color: '#e8e8e8', fontVariantNumeric: 'tabular-nums' }}>
                        {p.currency} {Number(p.amount).toLocaleString()}
                      </span>
                      <span style={{ fontSize: 10, color: p.status === 'verified' ? '#6fcf97' : p.status === 'failed' ? '#e05c5c' : '#f6c90e' }}>
                        {p.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
                      {formatDate(p.created_at)} · <code>{p.reference}</code>
                    </div>
                  </div>
                ))
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontSize: 10, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase',
        marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #1a1a1a',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
      <span style={{ color: '#888' }}>{label}</span>
      <span style={{ color: '#ddd' }}>{value}</span>
    </div>
  );
}

// Inline form: grant a tier to ANY email (creates the public.users
// row if it doesn't exist yet — useful for pre-loading paid customers
// who haven't signed up yet, or unverified magic-link recipients).
// Per-row admin actions:
//   🔑 Reset PW  — sends the user a recovery email via Supabase Auth
//   🔒 Set PW    — admin directly sets a new password (no email round
//                  trip) via the SECURITY DEFINER RPC in
//                  SUPABASE_ADMIN_PASSWORD.sql. Useful for support
//                  cases where the user can't access their inbox.
function UserRowActions({ email, adminPassword, verified, onChanged }) {
  const [state, setState] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [errMsg, setErrMsg] = useState('');
  const [mode, setMode] = useState('idle'); // 'idle' | 'setting'
  const [newPw, setNewPw] = useState('');
  const [setOk, setSetOk] = useState(null); // last successfully set password (so admin can WhatsApp it)

  const sendReset = async () => {
    if (state === 'sending') return;
    if (!confirm(`Send a password-reset email to ${email}?\n\nThey'll get a one-time link from Supabase to set a new password.`)) return;
    setState('sending');
    setErrMsg('');
    try {
      // Direct call to /auth/v1/recover — bypasses the SDK fetch wedge
      // that supabase.auth.resetPasswordForEmail can get stuck on.
      const redirectTo = `${window.location.origin}/?reset=1`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/recover`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, redirect_to: redirectTo }),
      });
      clearTimeout(timer);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Reset failed: ${res.status} — ${body.slice(0, 150)}`);
      }
      setState('sent');
      setTimeout(() => setState('idle'), 6000);
    } catch (err) {
      setErrMsg(err.name === 'AbortError' ? 'Reset request timed out (15s)' : err.message || 'Failed to send');
      setState('error');
      setTimeout(() => setState('idle'), 6000);
    }
  };

  const generatePassword = () => {
    // 12 chars, mixed alphanum, no ambiguous 0/O/1/l/I. Easy to read
    // over the phone or paste into WhatsApp.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let out = '';
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (const n of arr) out += alphabet[n % alphabet.length];
    setNewPw(out);
  };

  const savePassword = async () => {
    const pw = newPw.trim();
    if (pw.length < 6) { alert('Password must be at least 6 characters.'); return; }
    if (!confirm(`Set ${email}'s password to:\n\n  ${pw}\n\nThe user will be able to sign in with this password immediately.`)) return;
    setState('sending');
    setErrMsg('');
    try {
      const data = await rpcDirect('set_user_password_admin', {
        p_password: adminPassword,
        p_email: email,
        p_new_password: pw,
      }, { label: 'Set password', timeoutMs: 15_000 });
      if (data !== true) throw new Error('Server returned an unexpected response.');
      setSetOk(pw);
      setMode('idle');
      setNewPw('');
      setState('sent');
      setTimeout(() => setState('idle'), 6000);
    } catch (err) {
      setErrMsg(err.message || 'Failed to set password');
      setState('error');
      setTimeout(() => setState('idle'), 6000);
    }
  };

  // Inline "set password" composer
  if (mode === 'setting') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          placeholder="New password (6+ chars)"
          autoFocus
          style={{
            background: '#0c0c0c', border: '1px solid #2a2a2a', color: '#ddd',
            fontSize: 11, padding: '4px 8px', borderRadius: 3, outline: 'none',
            width: 150,
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') savePassword(); if (e.key === 'Escape') { setMode('idle'); setNewPw(''); } }}
        />
        <button
          onClick={generatePassword}
          title="Generate a random 12-character password"
          style={{
            padding: '4px 8px', fontSize: 10, background: '#181818', color: '#b89fff',
            border: '1px solid #2a2a2a', borderRadius: 3, cursor: 'pointer',
          }}
        >🎲</button>
        <button
          onClick={savePassword}
          disabled={state === 'sending' || newPw.trim().length < 6}
          style={{
            padding: '4px 10px', fontSize: 10, fontWeight: 600,
            background: '#1a3580', color: '#fff', border: 'none',
            borderRadius: 3, cursor: state === 'sending' ? 'wait' : 'pointer',
            opacity: newPw.trim().length < 6 ? 0.5 : 1,
          }}
        >{state === 'sending' ? 'Saving…' : 'Save'}</button>
        <button
          onClick={() => { setMode('idle'); setNewPw(''); }}
          style={{
            padding: '4px 8px', fontSize: 10, background: 'none',
            color: '#666', border: 'none', cursor: 'pointer',
          }}
        >Cancel</button>
      </div>
    );
  }

  // Just-saved confirmation with WhatsApp / Copy quick-actions
  if (setOk) {
    const waMsg = `Your AutoBook account password has been set.\n\nEmail: ${email}\nPassword: ${setOk}\n\nSign in at https://autobookbynej.online/ — please change this password from the profile menu after signing in.`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span title={setOk} style={{
          padding: '4px 8px', fontSize: 11,
          background: '#0e1a10', color: '#6fcf97',
          border: '1px solid #2a4a2a', borderRadius: 3,
          fontFamily: 'ui-monospace, monospace',
          maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{setOk}</span>
        <button
          onClick={() => { navigator.clipboard?.writeText(setOk); }}
          title="Copy password"
          style={{
            padding: '4px 8px', fontSize: 10,
            background: '#181818', color: '#aaa',
            border: '1px solid #2a2a2a', borderRadius: 3, cursor: 'pointer',
          }}
        >📋</button>
        <a
          href={waUrl}
          target="_blank" rel="noopener noreferrer"
          title="Open WhatsApp with the credentials pre-filled"
          style={{
            padding: '4px 8px', fontSize: 10, fontWeight: 600,
            background: '#0e1a10', color: '#25d366',
            border: '1px solid #1d3a25', borderRadius: 3, textDecoration: 'none',
          }}
        >💬</a>
        <button
          onClick={() => setSetOk(null)}
          title="Done"
          style={{
            padding: '4px 6px', fontSize: 10, background: 'none',
            color: '#666', border: 'none', cursor: 'pointer',
          }}
        >✕</button>
      </div>
    );
  }

  const resetLabel =
    state === 'sending' ? 'Sending…' :
    state === 'sent'    ? '✓ Sent' :
    state === 'error'   ? '⚠ Failed' :
    '🔑 Reset PW';
  const resetColors =
    state === 'sent'  ? { bg: '#0e1a10', fg: '#6fcf97', border: '#2a4a2a' } :
    state === 'error' ? { bg: '#1a0808', fg: '#e05c5c', border: '#5a1a1a' } :
                        { bg: '#181818', fg: '#aaa',    border: '#2a2a2a' };

  const confirmEmail = async () => {
    if (state === 'sending') return;
    if (!confirm(`Mark ${email} as confirmed?\n\nUse this when the user says they can't sign in even with the right password — that usually means their email_confirmed_at is null. Confirming lets them sign in immediately.`)) return;
    setState('sending');
    try {
      const data = await rpcDirect('confirm_user_email_admin', {
        p_password: adminPassword,
        p_email: email,
      }, { label: 'Confirm email', timeoutMs: 15_000 });
      if (data !== true) throw new Error('Server returned an unexpected response.');
      onChanged?.();
    } catch (err) {
      alert(`Confirm failed: ${err.message}\n\nDid you install SUPABASE_ADMIN_CONFIRM.sql?`);
      setState('idle');
    }
  };

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {!verified && (
        <button
          onClick={confirmEmail}
          disabled={state === 'sending'}
          title={`Mark ${email}'s email as confirmed so they can sign in with their password`}
          style={{
            padding: '4px 10px', fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
            background: '#0e1a10', color: '#6fcf97',
            border: '1px solid #2a4a2a',
            borderRadius: 3, cursor: state === 'sending' ? 'wait' : 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ✔ Confirm
        </button>
      )}
      <button
        onClick={sendReset}
        disabled={state === 'sending'}
        title={state === 'error' ? errMsg : `Email ${email} a password reset link`}
        style={{
          padding: '4px 10px', fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
          background: resetColors.bg, color: resetColors.fg,
          border: `1px solid ${resetColors.border}`,
          borderRadius: 3, cursor: state === 'sending' ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        {resetLabel}
      </button>
      <button
        onClick={() => setMode('setting')}
        title={`Set a new password for ${email} directly (no email round-trip)`}
        style={{
          padding: '4px 10px', fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
          background: '#181818', color: '#b89fff',
          border: '1px solid #2a2240',
          borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        🔒 Set PW
      </button>
      <button
        onClick={async () => {
          const typed = window.prompt(
            `Permanently delete ${email}?\n\nThis hard-deletes the auth user, public.users row, sessions, and identities. There is no undo.\n\nType DELETE to confirm:`,
            ''
          );
          if (typed !== 'DELETE') return;
          setState('sending');
          try {
            const data = await rpcDirect('delete_user_admin', {
              p_password: adminPassword,
              p_email: email,
            }, { label: 'Delete user', timeoutMs: 15_000 });
            if (data !== true) throw new Error('Server returned an unexpected response.');
            onChanged?.();
          } catch (err) {
            alert(`Delete failed: ${err.message}`);
            setState('idle');
          }
        }}
        disabled={state === 'sending'}
        title={`Permanently delete ${email}`}
        style={{
          padding: '4px 10px', fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
          background: '#1a0808', color: '#e05c5c',
          border: '1px solid #5a1a1a',
          borderRadius: 3, cursor: state === 'sending' ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        🗑 Delete
      </button>
    </div>
  );
}

function AddUserByEmail({ password, onAdded }) {
  const [email, setEmail] = useState('');
  const [tier, setTier] = useState('pro');
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleAdd = async (e) => {
    e?.preventDefault?.();
    if (!email.trim() || pending) return;
    setPending(true); setMsg(null);
    try {
      const data = await rpcDirect('set_tier_by_email_admin', {
        p_password: password,
        p_email: email.trim(),
        p_tier: tier,
      }, { label: 'Grant tier', timeoutMs: 15_000 });
      setMsg({ tone: 'ok', text: `${data === 'created' ? 'Created' : 'Updated'}: ${email.trim()} → ${tier}` });
      setEmail('');
      onAdded?.();
    } catch (err) {
      setMsg({ tone: 'err', text: err.message || 'Failed' });
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={handleAdd} style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
      padding: '8px 10px', background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 6,
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: 10, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase', marginRight: 4 }}>
        Grant tier
      </span>
      <input
        type="email" required
        placeholder="customer@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ ...inputStyle, flex: 1, minWidth: 220 }}
      />
      <select value={tier} onChange={(e) => setTier(e.target.value)} style={{
        ...inputStyle, padding: '6px 10px', cursor: 'pointer',
      }}>
        <option value="free">Free</option>
        <option value="starter">Starter</option>
        <option value="pro">✦ Pro</option>
      </select>
      <button type="submit" disabled={!email.trim() || pending} style={{
        padding: '6px 14px', fontSize: 11, fontWeight: 600,
        background: '#1a3580', color: '#fff', border: 'none', borderRadius: 4,
        cursor: pending || !email.trim() ? 'not-allowed' : 'pointer',
        opacity: pending || !email.trim() ? 0.5 : 1,
      }}>
        {pending ? 'Saving…' : '+ Grant'}
      </button>
      {msg && (
        <span style={{
          fontSize: 11,
          color: msg.tone === 'ok' ? '#6fcf97' : '#e05c5c',
        }}>
          {msg.text}
        </span>
      )}
    </form>
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

function PaymentsPanel({ activity }) {
  const payments = (activity || []).filter((a) => a.kind === 'payment');
  if (payments.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 12 }}>
        No payments in the last 30 days yet.
      </div>
    );
  }
  return (
    <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#0c0c0c' }}>
            {['When', 'User', 'Amount', 'Status'].map((h) => (
              <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#888', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {payments.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #161616' }}>
              <td style={{ ...cellStyle, color: '#888' }}>{formatDate(p.at)}</td>
              <td style={cellStyle}>{p.email}</td>
              <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: '#e8e8e8', fontWeight: 600 }}>
                {p.meta?.currency} {Number(p.meta?.amount || 0).toLocaleString()}
              </td>
              <td style={cellStyle}>
                <span style={{
                  fontSize: 9, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 3,
                  background: p.meta?.status === 'verified' ? '#0e1a10' : p.meta?.status === 'failed' ? '#1a0808' : '#1a1408',
                  color:      p.meta?.status === 'verified' ? '#6fcf97' : p.meta?.status === 'failed' ? '#e05c5c' : '#f6c90e',
                }}>
                  {p.meta?.status || '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReferralsPanel({ data }) {
  if (!data) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 12 }}>
        Loading… (if this stays, run <code>SUPABASE_REFERRALS.sql</code> in Supabase SQL Editor)
      </div>
    );
  }
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <MetricCard label="Invites sent"  value={data.total_invited}     accent="#4f8ef7" />
        <MetricCard label="Converted"     value={data.total_converted}   hint={`${data.conversion_pct}% conversion`} accent="#6fcf97" />
        <MetricCard label="Discount given" value={`${data.total_discount_given}%`} hint="Sum of % redeemed so far" accent="#f6c90e" />
        <MetricCard label="Redeemed"      value={data.total_redeemed}    accent="#b89fff" />
      </div>

      <div style={{ fontSize: 11, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10 }}>
        Top referrers
      </div>
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#0c0c0c' }}>
              {['Referrer', 'Invited', 'Converted', 'Redeemed'].map((h) => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 12px', color: '#888', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', borderBottom: '1px solid #1a1a1a' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data.top_referrers || []).length === 0 && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#555' }}>
                No referrals yet. Share the referral link from the user profile menu to earn discounts.
              </td></tr>
            )}
            {(data.top_referrers || []).map((r) => (
              <tr key={r.referrer_email} style={{ borderBottom: '1px solid #161616' }}>
                <td style={cellStyle}>{r.referrer_email}</td>
                <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums' }}>{r.invited}</td>
                <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: '#6fcf97' }}>{r.converted}</td>
                <td style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', color: '#b89fff' }}>{r.redeemed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const navFootBtn = {
  display: 'block', width: '100%', textAlign: 'left',
  padding: '7px 12px', marginBottom: 2,
  background: 'transparent', border: 'none',
  color: '#888', fontSize: 11, cursor: 'pointer',
  textDecoration: 'none', borderRadius: 5,
};

function BulkActionBar({ count, onClear, onSetTier, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', marginBottom: 10,
      background: '#0e1620', border: '1px solid #1e3a5f',
      borderRadius: 6,
    }}>
      <span style={{ fontSize: 12, color: '#9fb8d8', fontWeight: 600 }}>
        {count} selected
      </span>
      <span style={{ flex: 1 }} />
      <button onClick={() => onSetTier('free')} style={bulkBtn('#aaa')}>→ Free</button>
      <button onClick={() => onSetTier('starter')} style={bulkBtn('#6fb8d8')}>→ Starter</button>
      <button onClick={() => onSetTier('pro')} style={bulkBtn('#f6c90e')}>→ Pro</button>
      <button onClick={onDelete} style={bulkBtn('#e05c5c')}>🗑 Delete</button>
      <button onClick={onClear} style={{ ...bulkBtn('#666'), background: 'transparent', border: 'none' }}>✕ Clear</button>
    </div>
  );
}

const bulkBtn = (color) => ({
  padding: '5px 12px', fontSize: 11, fontWeight: 600,
  background: '#181818', color,
  border: `1px solid ${color}40`,
  borderRadius: 4, cursor: 'pointer',
});

function MetricCard({ label, value, delta, hint, accent }) {
  const trend = delta == null ? null
    : delta > 0 ? { color: '#6fcf97', sign: '↑' }
    : delta < 0 ? { color: '#e05c5c', sign: '↓' }
    : { color: '#666', sign: '·' };
  return (
    <div style={{
      background: '#111', border: '1px solid #1a1a1a', borderRadius: 8,
      padding: '14px 18px', borderLeft: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 10, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 26, fontWeight: 600, color: '#e8e8e8', fontVariantNumeric: 'tabular-nums' }}>
          {value ?? '—'}
        </div>
        {trend && (
          <div style={{ fontSize: 11, color: trend.color, fontWeight: 600 }}>
            {trend.sign} {Math.abs(delta)}% vs prev
          </div>
        )}
      </div>
      {hint && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>{hint}</div>
      )}
    </div>
  );
}

function pctDelta(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (p === 0) return c > 0 ? 100 : null;
  return Math.round(((c - p) / p) * 100);
}

// Inline SVG sparkline — no chart library dependency.
function Sparkline({ data, label }) {
  const values = Array.isArray(data) ? data.map((d) => Number(d.daily) || 0) : [];
  const max = Math.max(1, ...values);
  const w = 480, h = 64, pad = 4;
  const points = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, values.length - 1);
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');
  const total = values.reduce((s, v) => s + v, 0);
  const lastDate = data?.[data.length - 1]?.d;
  return (
    <div style={{
      background: '#111', border: '1px solid #1a1a1a', borderRadius: 8,
      padding: '14px 18px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 10, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 11, color: '#888' }}>{total} total · through {lastDate || '—'}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 64, display: 'block' }}>
        <polyline points={points} fill="none" stroke="#4f8ef7" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        <polygon points={`${pad},${h - pad} ${points} ${w - pad},${h - pad}`} fill="#4f8ef7" opacity="0.12" />
      </svg>
    </div>
  );
}

// Donut tier mix — pure SVG.
function TierMixDonut({ mix }) {
  const free = Number(mix.free) || 0;
  const starter = Number(mix.starter) || 0;
  const pro = Number(mix.pro) || 0;
  const total = free + starter + pro;
  const segs = total === 0
    ? [{ color: '#1a1a1a', frac: 1, label: 'No users yet' }]
    : [
        { color: '#4a4a4a', frac: free / total,    label: `Free ${free}` },
        { color: '#6fb8d8', frac: starter / total, label: `Starter ${starter}` },
        { color: '#f6c90e', frac: pro / total,     label: `Pro ${pro}` },
      ];
  const R = 28, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{
      background: '#111', border: '1px solid #1a1a1a', borderRadius: 8,
      padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={R} fill="none" stroke="#1a1a1a" strokeWidth="10" />
        {segs.map((s, i) => {
          const len = s.frac * C;
          const seg = (
            <circle key={i} cx="40" cy="40" r={R} fill="none"
              stroke={s.color} strokeWidth="10"
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 40 40)"
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div>
        <div style={{ fontSize: 10, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Tier mix
        </div>
        {segs.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#bbb', marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            <span>{s.label}</span>
          </div>
        ))}
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
