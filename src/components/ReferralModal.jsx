import { useEffect, useState } from 'react';
import { rpcDirect } from '../utils/supabase';

// Refer-a-friend modal. Generates / fetches the user's unique referral
// code on open, shows the share link, lets them copy or WhatsApp it,
// and shows their conversion stats + available discount.
//
// Discount accrues 20% per converted referral (someone signs up via
// their link AND becomes a paying customer), stackable up to 100% off
// their next subscription. Redemption happens automatically at the
// next Paystack checkout via redeem_my_referral_discount.
export default function ReferralModal({ open, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null); setErr(null); setCopied(false);
    let alive = true;
    (async () => {
      try {
        // Make sure the user has a code, then fetch the summary.
        await rpcDirect('get_or_create_my_referral_code', {}, {
          label: 'Get ref code', timeoutMs: 10_000, useUserToken: true,
        });
        const summary = await rpcDirect('get_my_referral_summary', {}, {
          label: 'Ref summary', timeoutMs: 10_000, useUserToken: true,
        });
        if (alive) setData(summary);
      } catch (e) {
        if (!alive) return;
        const msg = (e?.message || '').toLowerCase();
        if (msg.includes('could not find the function') || msg.includes('404')) {
          setErr(
            "The referral program isn't installed in your Supabase project yet. " +
            "Open Supabase SQL Editor and run SUPABASE_REFERRALS.sql " +
            "(replace CHANGE_THIS_PASSWORD with your admin password before running)."
          );
        } else if (msg.includes('not signed in')) {
          setErr("Sign in first — referral links are tied to your account.");
        } else {
          setErr(e.message);
        }
      }
    })();
    return () => { alive = false; };
  }, [open]);

  if (!open) return null;

  const link = data?.code
    ? `${window.location.origin}/?ref=${data.code}`
    : '';

  const waMsg = `I've been using AutoBook to design photobooks fast — wedding/portrait/event photographers love it. Sign up with my link and we both get rewarded: ${link}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(waMsg)}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(waMsg)}`;
  const mailUrl = `mailto:?subject=${encodeURIComponent('Try AutoBook — photobook designer')}&body=${encodeURIComponent(waMsg)}`;

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 220,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', border: '1px solid #1f1f1f',
        borderRadius: 10, padding: '24px 28px',
        width: 460, maxWidth: '94vw',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Refer photographers, earn 20% off
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 18, lineHeight: 1.55 }}>
          Get 20% off your next subscription for every paying customer you
          send our way. Stackable up to 100% — five conversions and your
          next plan is free.
        </div>

        {err && (
          <div style={{ padding: '10px 12px', marginBottom: 12, background: '#1a0808', border: '1px solid #5a1a1a', color: '#e05c5c', fontSize: 11, borderRadius: 5 }}>
            {err}
          </div>
        )}

        {!data && !err && (
          <div style={{ padding: '20px 0', color: '#666', fontSize: 12, textAlign: 'center' }}>
            Generating your referral link…
          </div>
        )}

        {data && (
          <>
            {/* The link */}
            <label style={{ display: 'block', marginBottom: 4, fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase' }}>
              Your link
            </label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.target.select()}
                style={{
                  flex: 1, boxSizing: 'border-box',
                  background: '#181818', border: '1px solid #252525',
                  borderRadius: 5, color: '#ddd', fontSize: 12,
                  padding: '9px 11px', outline: 'none',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                }}
              />
              <button onClick={() => {
                navigator.clipboard?.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }} style={{
                padding: '8px 14px', fontSize: 11, fontWeight: 600,
                background: copied ? '#0e1a10' : '#1a3580',
                color: copied ? '#6fcf97' : '#fff',
                border: 'none', borderRadius: 5, cursor: 'pointer',
              }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Share buttons */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" style={shareBtn('#25d366', '#0e1a10')}>
                💬 WhatsApp
              </a>
              <a href={xUrl} target="_blank" rel="noopener noreferrer" style={shareBtn('#fff', '#181818')}>
                𝕏 Post
              </a>
              <a href={mailUrl} style={shareBtn('#aaa', '#181818')}>
                ✉ Email
              </a>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              <Stat label="Invited" value={data.invited} color="#888" />
              <Stat label="Converted" value={data.converted} color="#6fcf97" />
              <Stat label="Discount earned" value={`${data.discount_pct}%`} color="#f6c90e" />
            </div>

            {(data.recent || []).length > 0 && (
              <>
                <div style={{ fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                  Recent
                </div>
                <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 6, padding: 6, maxHeight: 140, overflowY: 'auto' }}>
                  {data.recent.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '6px 8px', fontSize: 11,
                      borderBottom: i < data.recent.length - 1 ? '1px solid #161616' : 'none',
                    }}>
                      <span style={{ color: '#bbb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.email}
                      </span>
                      <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, fontWeight: 600,
                        background: r.status === 'converted' || r.status === 'redeemed' ? '#0e1a10' : '#1a1408',
                        color:      r.status === 'converted' || r.status === 'redeemed' ? '#6fcf97' : '#f6c90e',
                      }}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} style={{
            padding: '8px 14px', fontSize: 12,
            background: 'transparent', color: '#666', border: '1px solid #2a2a2a',
            borderRadius: 5, cursor: 'pointer',
          }}>Done</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{
      background: '#0c0c0c', border: '1px solid #1a1a1a',
      borderRadius: 6, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 9, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

const shareBtn = (color, bg) => ({
  flex: 1, textAlign: 'center',
  padding: '8px 10px', fontSize: 11, fontWeight: 600,
  background: bg, color, border: `1px solid ${color}40`,
  borderRadius: 5, textDecoration: 'none', cursor: 'pointer',
});
