import { useState } from 'react';
import {
  STARTER_FEATURES, PRO_FEATURES, FREE_FEATURES,
  priceForProject,
} from '../utils/premium';
import {
  claimPlan, formatPrice, unlockProject, priceForPlan,
} from '../utils/paystack';
import {
  openCheckout, openBookCheckout, isCheckoutConfiguredFor,
} from '../utils/payments';
import { savePending, tryClaimWithRetry } from '../utils/pendingClaim';
import { useCurrency, CURRENCIES, formatMoney } from '../utils/currency';
import { useAuthUser } from '../utils/supabase';
import { useBookStore } from '../store/useBookStore';
import { getActiveProjectId } from '../store/projects';
import DesktopDownloads from './DesktopDownloads';
import AuthModal from './AuthModal';

// ── Direct-payment fallback ────────────────────────────────────────────
// If the Paystack inline popup misbehaves (network glitch, popup blocked,
// browser extension, etc.) the user can still pay through a static
// Paystack pay-page. One URL handles all three paths because the page is
// configured as "let customer enter amount" — the modal shows the exact
// amount to type.
const DIRECT_PAYSTACK_URL = 'https://paystack.shop/pay/rduw1so423';
const SUPPORT_WHATSAPP = '+2347030077967';
const SUPPORT_EMAIL = 'support@autobookbynej.online';

export default function UpgradeModal({ open, onClose, blockedFeature, onUnlockSuccess }) {
  const [paying, setPaying] = useState(false); // 'starter' | 'pro' | 'book' | false
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [authPrompt, setAuthPrompt] = useState(null); // 'starter' | 'pro' | 'book' | null — pending plan after signup
  const user = useAuthUser();
  const spreads = useBookStore((s) => s.spreads);
  const { code: currencyCode, set: setCurrency, currency, available } = useCurrency();
  if (!open) return null;

  const canPay = isCheckoutConfiguredFor(currencyCode) && user?.email;
  const bookPrice = priceForProject(spreads, currencyCode);
  const projectId = getActiveProjectId();

  // Click intent gets remembered so we can resume after sign-up. The
  // resume runs immediately from AuthModal's onAuthed callback (which
  // fires AFTER the user record is hydrated) instead of relying on a
  // useEffect dependency on `user`.
  const handlePlanClick = (plan) => {
    if (paying || success) return;
    if (!isCheckoutConfiguredFor(currencyCode)) { setError('Payments not configured yet.'); return; }
    if (!user?.email) { setAuthPrompt(plan); return; }
    if (plan === 'book') doPayPerBook(); else doPay(plan);
  };

  const doPay = async (plan) => {
    if (!user?.email || paying) return;
    setError(null);
    setPaying(plan);
    let paidReference = null;
    try {
      paidReference = await openCheckout({ email: user.email, plan, currencyCode });
      // Charge is confirmed by the gateway. Stash everything we need to
      // grant the plan BEFORE we try the grant — that way a network drop
      // between here and the next line can be rescued at app boot.
      const claim = {
        kind: 'plan',
        plan,
        reference: paidReference,
        currencyCode,
        amount: priceForPlan(plan, currencyCode),
      };
      savePending(claim);
      const result = await tryClaimWithRetry(claim);
      if (!result.ok) throw result.error || new Error('Claim failed.');
      setSuccess(plan);
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      if (paidReference) {
        // Payment succeeded but every retry to grant the plan failed.
        // The pendingClaim record stays in localStorage; on the next
        // app boot replayPendingClaims() will retry automatically.
        setError(
          `Payment received successfully — but we couldn't apply your plan yet. `
          + `Don't worry, it's queued. Refresh in a minute and your plan will be active. `
          + `Ref: ${paidReference.slice(0, 24)}…`
        );
      } else {
        setError(err.message || 'Payment failed. Try again.');
      }
    } finally {
      setPaying(false);
    }
  };

  const doPayPerBook = async () => {
    if (!user?.email || paying) return;
    if (!projectId) { setError('Open or create a project first.'); return; }
    if (bookPrice.totalNGN <= 0) { setError('This book has no spreads to unlock yet.'); return; }
    setError(null);
    setPaying('book');
    let paidReference = null;
    try {
      // Gateway popup. Resolves with the reference on user payment.
      paidReference = await openBookCheckout({
        email: user.email,
        projectId,
        total: bookPrice.total,
        spreadCount: bookPrice.spreadCount,
        coverCount: bookPrice.coverCount,
        currencyCode,
      });
      // Charge confirmed by the gateway. Stash the unlock payload BEFORE
      // we try to record it — so if the next request drops, app-boot
      // replay can rescue without the user having to contact support.
      const claim = {
        kind: 'book',
        projectId,
        spreadCount: bookPrice.spreadCount,
        coverCount: bookPrice.coverCount,
        amount: bookPrice.total,
        reference: paidReference,
        currencyCode,
      };
      savePending(claim);
      const result = await tryClaimWithRetry(claim);
      if (!result.ok) throw result.error || new Error('Claim failed.');
      // Show "Payment success" before triggering download / closing.
      setSuccess('book');
      setPaying(false);
      // Brief delay so the user sees the green confirmation, then hand
      // off to onUnlockSuccess which re-runs whatever action the user
      // was attempting when the gate fired. No page reload — the unlock
      // is already recorded, the export can proceed in-memory.
      setTimeout(async () => {
        if (onUnlockSuccess) {
          await onUnlockSuccess();
        } else {
          window.location.reload();
        }
      }, 1200);
    } catch (err) {
      if (paidReference) {
        setError(
          `Payment received successfully — but we couldn't unlock the book yet. `
          + `It's queued and will retry automatically. Refresh in a minute. `
          + `Ref: ${paidReference.slice(0, 24)}…`
        );
      } else {
        setError(err.message || 'Payment failed. Try again.');
      }
      setPaying(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', border: '1px solid #1f1f1f',
        borderRadius: 10, padding: '22px 26px',
        width: 720, maxWidth: '94vw',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#e8e8e8', marginBottom: 4 }}>
          {blockedFeature ? 'Premium feature' : 'Pick a plan'}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 20, lineHeight: 1.5 }}>
          {blockedFeature
            ? <>This <b style={{ color: '#ddd' }}>{blockedFeature}</b> requires a paid plan.</>
            : 'One-time payment. Unlocks Premium features on this account.'}
        </div>

        {!isCheckoutConfiguredFor(currencyCode) && (
          <div style={warnBox}>
            ⚠ Payment gateway not configured for {currencyCode}. Owner: set
            {currency?.processor === 'flutterwave' ? ' VITE_FLUTTERWAVE_PUBLIC_KEY' : ' VITE_PAYSTACK_PUBLIC_KEY'}
            {' '}in .env.production.
          </div>
        )}
        {!user?.email && (
          <div style={{ ...warnBox, background: '#0c1620', borderColor: '#1e3a5f', color: '#9fb8d8' }}>
            Tap any plan below — we'll create your account on the same screen
            (email + password, no email round-trip) before opening Paystack.
          </div>
        )}

        {/* Currency selector */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {available.map((c) => {
            const cur = CURRENCIES[c];
            const active = c === currencyCode;
            return (
              <button key={c} onClick={() => setCurrency(c)} style={{
                padding: '4px 10px', fontSize: 10, fontWeight: 600,
                background: active ? '#1a3580' : '#161616',
                color: active ? '#fff' : '#888',
                border: `1px solid ${active ? '#2a4a90' : '#252525'}`,
                borderRadius: 4, cursor: 'pointer', letterSpacing: 0.5,
              }}>
                {cur.flag} {cur.label}
              </button>
            );
          })}
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
          {/* PAY PER BOOK — counts ONLY designed spreads (cells with photos). */}
          <PlanCard
            name="Pay-per-book"
            price={formatMoney(bookPrice.total, currencyCode)}
            badge="This book only"
            badgeColor="#6fb8d8"
            accentColor="#0e2a3a"
            features={[
              { key: 'count',
                name: bookPrice.spreadCount + bookPrice.coverCount > 0
                  ? `${bookPrice.spreadCount} designed spread${bookPrice.spreadCount === 1 ? '' : 's'}${bookPrice.coverCount ? ` + ${bookPrice.coverCount} cover` : ''}`
                  : 'No designed spreads yet',
                detail: bookPrice.totalSpreadsInBook > 0
                  ? `${bookPrice.spreadCount + bookPrice.coverCount} of ${bookPrice.totalSpreadsInBook} spreads have photos · ${formatMoney(currency.spread, currencyCode)}/spread · ${formatMoney(currency.cover, currencyCode)}/cover`
                  : `${formatMoney(currency.spread, currencyCode)} per spread · ${formatMoney(currency.cover, currencyCode)} for cover` },
              { key: 'export', name: 'Unlimited exports of this book',
                detail: 'Re-export anytime, no extra charge. Design more spreads later — pay only for the new ones.' },
              { key: 'share', name: 'Client proofing portal' },
              { key: 'no-watermark', name: 'No watermark' },
            ]}
            buttonLabel={
              success === 'book' ? '✓ Payment success — preparing download…' :
              paying === 'book' ? 'Opening Paystack…' :
              bookPrice.total > 0 ? `Pay ${formatMoney(bookPrice.total, currencyCode)} for this book` :
              'Add photos to a spread first'
            }
            onClick={() => handlePlanClick('book')}
            disabled={paying || success || bookPrice.total <= 0 || !isCheckoutConfiguredFor(currencyCode)}
            success={success === 'book'}
          />
          {/* STARTER */}
          <PlanCard
            name="Starter"
            price={formatPrice('starter', currencyCode)}
            badge="10 photobooks"
            badgeColor="#6fcf97"
            accentColor="#2a4a2a"
            features={STARTER_FEATURES}
            buttonLabel={
              success === 'starter' ? '✓ Activated' :
              paying === 'starter' ? 'Opening Paystack…' :
              `Choose Starter · ${formatPrice('starter', currencyCode)}`
            }
            onClick={() => handlePlanClick('starter')}
            disabled={paying || success || !isCheckoutConfiguredFor(currencyCode)}
            success={success === 'starter'}
          />
          {/* PRO */}
          <PlanCard
            name="Pro"
            price={formatPrice('pro', currencyCode)}
            badge="Unlimited + Pro templates"
            badgeColor="#f6c90e"
            accentColor="#3a2a08"
            features={PRO_FEATURES}
            highlight
            buttonLabel={
              success === 'pro' ? '✓ Activated' :
              paying === 'pro' ? 'Opening Paystack…' :
              `Choose Pro · ${formatPrice('pro', currencyCode)}`
            }
            onClick={() => handlePlanClick('pro')}
            disabled={paying || success || !isCheckoutConfiguredFor(currencyCode)}
            success={success === 'pro'}
          />
        </div>

        {error && <div style={errBox}>{error}</div>}
        {success && (
          <div style={okBox}>
            {success === 'book'
              ? '✓ Payment confirmed by Paystack — starting your download…'
              : `✓ ${success === 'pro' ? 'Pro' : 'Starter'} activated. Refreshing…`}
          </div>
        )}

        {/* Direct-payment fallback — only shown when no success state.
            Opens the static Paystack pay-page in a new tab and shows
            the exact amount to enter. After payment, the user pings
            support via WhatsApp/email with their email + plan; we
            verify and unlock manually from the admin dashboard. */}
        {!success && (
          <DirectPaymentFallback
            user={user}
            currencyCode={currencyCode}
            currency={currency}
            bookPrice={bookPrice}
          />
        )}

        {/* Free tier reference */}
        <details style={{ marginTop: 8 }}>
          <summary style={{ fontSize: 11, color: '#666', cursor: 'pointer', padding: '4px 0' }}>
            What stays free
          </summary>
          <div style={{ background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 6, padding: '10px 12px', marginTop: 4 }}>
            {FREE_FEATURES.map((f) => (
              <div key={f.key} style={{ marginBottom: 6, fontSize: 11 }}>
                <span style={{ color: '#999' }}>· {f.name}</span>
                {f.detail && <div style={{ color: '#555', fontSize: 10, marginLeft: 10 }}>{f.detail}</div>}
              </div>
            ))}
          </div>
        </details>

        {/* Offline option — desktop apps */}
        <div style={{ marginTop: 14 }}>
          <DesktopDownloads compact />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} disabled={Boolean(paying)} style={btnGhost}>Not now</button>
        </div>
      </div>

      {/* Stacked auth modal — opens when an unauthed user clicks a
          plan. After successful signup/sign-in, the pending plan
          fires automatically so the user makes a single click and
          lands in the Paystack popup. */}
      <AuthModal
        open={Boolean(authPrompt)}
        action="signup"
        onClose={() => setAuthPrompt(null)}
        onAuthed={() => {
          const pending = authPrompt;
          setAuthPrompt(null);
          // Defer one tick so useAuthUser hydrates before doPay reads `user`.
          setTimeout(() => {
            if (pending === 'book') doPayPerBook();
            else if (pending) doPay(pending);
          }, 50);
        }}
      />
    </div>
  );
}

// Direct-payment fallback panel. Shown below the plan cards in the
// upgrade modal. Each "Pay directly" button opens the static Paystack
// pay-page in a new tab; the page is a "let customer enter amount"
// link, so the modal displays the exact amount the user should type.
// After payment they ping support (WhatsApp / email) with their account
// email + plan choice; we verify on the admin dashboard and grant the
// tier manually.
function DirectPaymentFallback({ user, currencyCode, currency, bookPrice }) {
  const [open, setOpen] = useState(false);

  const buildPayMsg = (planLabel, amount) => {
    const lines = [
      `Hi AutoBook — I just paid for ${planLabel}.`,
      `Amount: ${formatMoney(amount, currencyCode)} (${currencyCode})`,
      `Account email: ${user?.email || '(not signed in)'}`,
      '',
      'My Paystack receipt is attached.',
    ];
    return lines.join('\n');
  };

  const whatsappUrl = (msg) =>
    `https://wa.me/${SUPPORT_WHATSAPP.replace(/[^\d]/g, '')}?text=${encodeURIComponent(msg)}`;
  const mailUrl = (subject, msg) =>
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;

  return (
    <div style={{ marginTop: 18, padding: '12px 14px', background: '#0e1218', border: '1px solid #1f2630', borderRadius: 8 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9fb8d8', fontSize: 12, padding: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600 }}>Trouble with the payment popup?</span>
        <span style={{ color: '#666' }}>Pay directly via Paystack link instead</span>
      </button>

      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#888', lineHeight: 1.5 }}>
            Click any button below to open the Paystack payment page in a new tab.
            Type the exact amount shown, complete payment, then send us your receipt
            (WhatsApp or email) with your account email — we'll activate your plan within
            a few hours.
          </div>

          <DirectPayRow
            label="Starter"
            amount={currency.starter}
            currencyCode={currencyCode}
            payMsg={buildPayMsg('Starter', currency.starter)}
            whatsappUrl={whatsappUrl}
            mailUrl={mailUrl}
          />
          <DirectPayRow
            label="Pro"
            amount={currency.pro}
            currencyCode={currencyCode}
            payMsg={buildPayMsg('Pro', currency.pro)}
            whatsappUrl={whatsappUrl}
            mailUrl={mailUrl}
            highlight
          />
          {bookPrice.total > 0 && (
            <DirectPayRow
              label="This book"
              sub={`${bookPrice.spreadCount} spread${bookPrice.spreadCount === 1 ? '' : 's'}${bookPrice.coverCount ? ` + ${bookPrice.coverCount} cover` : ''}`}
              amount={bookPrice.total}
              currencyCode={currencyCode}
              payMsg={buildPayMsg(`Pay-per-book (${bookPrice.spreadCount} spreads${bookPrice.coverCount ? ` + ${bookPrice.coverCount} cover` : ''})`, bookPrice.total)}
              whatsappUrl={whatsappUrl}
              mailUrl={mailUrl}
            />
          )}

          <div style={{
            marginTop: 4, padding: '8px 10px',
            background: '#08130b', border: '1px solid #1d3a25',
            borderRadius: 5, fontSize: 11, color: '#6fcf97',
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <span>Need help paying or stuck?</span>
            <a
              href={whatsappUrl(`Hi AutoBook — I need help with payment. My account email is ${user?.email || '(not signed in)'}.`)}
              target="_blank" rel="noopener noreferrer"
              style={{ color: '#25d366', fontWeight: 600, textDecoration: 'none' }}
            >
              💬 WhatsApp {SUPPORT_WHATSAPP}
            </a>
            <span style={{ color: '#445' }}>·</span>
            <a
              href={mailUrl('AutoBook — payment help', `Hi — I need help paying. My account email is ${user?.email || '(not signed in)'}.`)}
              style={{ color: '#9fb8d8', textDecoration: 'none' }}
            >
              ✉ {SUPPORT_EMAIL}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectPayRow({ label, sub, amount, currencyCode, payMsg, whatsappUrl, mailUrl, highlight }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '10px 12px',
      background: highlight ? '#161208' : '#0a0d12',
      border: `1px solid ${highlight ? '#3a2a08' : '#1a2030'}`,
      borderRadius: 6,
    }}>
      <div style={{ flex: '1 1 140px', minWidth: 120 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: highlight ? '#f6c90e' : '#ddd' }}>
          {highlight ? '✦ ' : ''}{label}
        </div>
        {sub && <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>{sub}</div>}
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          Enter <b style={{ color: '#ddd' }}>{formatMoney(amount, currencyCode)}</b> on the Paystack page
        </div>
      </div>
      <a
        href={DIRECT_PAYSTACK_URL}
        target="_blank" rel="noopener noreferrer"
        style={{
          padding: '8px 14px', fontSize: 12, fontWeight: 600,
          background: highlight ? '#3a2a08' : '#1a3580',
          color: highlight ? '#f6c90e' : '#fff',
          border: highlight ? '1px solid #5a4010' : 'none',
          borderRadius: 5, textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Pay {formatMoney(amount, currencyCode)} →
      </a>
      <a
        href={whatsappUrl(payMsg)}
        target="_blank" rel="noopener noreferrer"
        title="Send your receipt on WhatsApp"
        style={{
          padding: '8px 12px', fontSize: 11,
          background: '#0e1a10', color: '#25d366',
          border: '1px solid #1d3a25',
          borderRadius: 5, textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        💬 Sent receipt
      </a>
    </div>
  );
}

function PlanCard({ name, price, badge, badgeColor, accentColor, features, buttonLabel, onClick, disabled, highlight, success }) {
  return (
    <div style={{
      background: highlight ? '#161208' : '#161616',
      border: `1px solid ${highlight ? '#3a2a08' : '#1f1f1f'}`,
      borderRadius: 8,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: highlight ? '#f6c90e' : '#ddd' }}>
          {highlight ? '✦ ' : ''}{name}
        </span>
        <span style={{ fontSize: 9, color: badgeColor, background: accentColor, padding: '3px 8px', borderRadius: 3, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {badge}
        </span>
      </div>

      <div style={{ fontSize: 26, fontWeight: 700, color: '#e8e8e8', marginTop: 8 }}>
        {price}
        <span style={{ fontSize: 11, color: '#666', fontWeight: 400, marginLeft: 6 }}>one-time</span>
      </div>

      <div style={{ marginTop: 14, flex: 1 }}>
        {features.map((f) => (
          <div key={f.key} style={{ marginBottom: 8, fontSize: 12 }}>
            <div style={{ color: '#ddd' }}>· {f.name}</div>
            {f.detail && <div style={{ color: '#666', fontSize: 10, marginLeft: 10 }}>{f.detail}</div>}
          </div>
        ))}
      </div>

      <button onClick={onClick} disabled={disabled} style={{
        marginTop: 14,
        padding: '11px 14px',
        fontSize: 12, fontWeight: 600,
        background: success ? '#0e1a10' : highlight ? '#3a2a08' : '#1a3580',
        color: success ? '#6fcf97' : highlight ? '#f6c90e' : '#fff',
        border: highlight ? '1px solid #5a4010' : 'none',
        borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}>
        {buttonLabel}
      </button>
    </div>
  );
}

const warnBox = {
  padding: '8px 10px', marginBottom: 14,
  background: '#1a1408', border: '1px solid #3a2a10',
  color: '#f6c90e', fontSize: 11, borderRadius: 5,
};
const errBox = {
  padding: '8px 10px', marginBottom: 10,
  background: '#1a0808', border: '1px solid #5a1a1a',
  color: '#e05c5c', fontSize: 11, borderRadius: 5,
};
const okBox = {
  padding: '10px 12px', marginBottom: 10,
  background: '#0e1a10', border: '1px solid #2a4a2a',
  color: '#6fcf97', fontSize: 12, borderRadius: 5,
};
const btnGhost = {
  padding: '8px 14px', fontSize: 12,
  background: 'transparent', color: '#666', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
