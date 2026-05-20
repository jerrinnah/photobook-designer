import { useState, useEffect } from 'react';
import {
  STARTER_FEATURES, PRO_FEATURES, FREE_FEATURES,
} from '../utils/premium';
import { formatPrice } from '../utils/paystack';
import { useCurrency, CURRENCIES, formatMoney } from '../utils/currency';
import SupportModal from './SupportModal';

// AutoBook marketing landing page. Lives at "/" so cold visitors get a
// proper introduction before being dropped into the editor. The "Open
// editor" CTA navigates to "/?app=1" which App.jsx routes to the real
// editor experience.

export default function LandingPage() {
  const [supportOpen, setSupportOpen] = useState(false);
  const goToEditor = () => { window.location.href = '?app=1'; };
  const goToPricing = () => {
    document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' });
  };
  const openSupport = () => setSupportOpen(true);

  return (
    <div style={{
      // body has overflow:hidden for the editor — override here so the
      // marketing page can actually scroll. position:absolute + inset:0
      // pins to the viewport; overflow-y:auto restores scrolling.
      position: 'absolute', inset: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
      background: '#0a0a0a',
      color: '#e8e8e8',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      lineHeight: 1.55,
    }}>
      <Nav onTry={goToEditor} onPricing={goToPricing} onSupport={openSupport} />
      <Hero onTry={goToEditor} onPricing={goToPricing} />
      <SocialProofBar />
      <HowItWorks />
      <DeviceSupport />
      <FeatureGrid />
      <Pricing onTry={goToEditor} />
      <FAQ />
      <FinalCTA onTry={goToEditor} />
      <Footer onSupport={openSupport} />
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────
function Nav({ onTry, onPricing, onSupport }) {
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 28px',
      background: 'rgba(10,10,10,0.85)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid #1a1a1a',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <img
          src="./logo.png"
          alt="AutoBook"
          style={{ height: 44, width: 44, objectFit: 'contain' }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>AutoBook</span>
        <span style={{ fontSize: 11, color: '#666', letterSpacing: 1, textTransform: 'uppercase' }}>by NEJ</span>
      </div>
      <button onClick={onPricing} style={navLinkStyle}>Pricing</button>
      <a href="#features" style={navLinkStyle}>Features</a>
      <a href="#faq" style={navLinkStyle}>FAQ</a>
      <button onClick={onSupport} style={navLinkStyle}>Support</button>
      <button onClick={onTry} style={ctaPrimary}>Open editor →</button>
    </nav>
  );
}

// ── Hero ───────────────────────────────────────────────────────────
function Hero({ onTry, onPricing }) {
  return (
    <section style={{
      padding: '88px 28px 56px',
      maxWidth: 1100, margin: '0 auto',
      textAlign: 'center',
    }}>
      <h1 style={{
        fontSize: 'clamp(36px, 5.5vw, 64px)',
        fontWeight: 700, lineHeight: 1.1, letterSpacing: -1.5,
        margin: '0 0 18px',
        color: '#fff',
      }}>
        Design wedding photobooks in<br />
        <span style={{ color: '#f6c90e' }}>5 minutes</span>, not 5 hours.
      </h1>
      <p style={{
        fontSize: 'clamp(15px, 1.6vw, 19px)',
        color: '#aaa', maxWidth: 680, margin: '0 auto 36px',
      }}>
        AutoBook gives wedding & event photographers AI-powered layouts,
        client review portals, and print-ready exports — for one fair price,
        no subscriptions.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
        <button onClick={onTry} style={{
          ...ctaPrimary,
          padding: '14px 28px', fontSize: 14,
        }}>
          Try the editor — free
        </button>
        <button onClick={onPricing} style={{
          ...ctaGhost,
          padding: '14px 28px', fontSize: 14,
        }}>
          See pricing
        </button>
      </div>
      <div style={{ fontSize: 12, color: '#666' }}>
        No signup required to try · 5 free exports during trial
      </div>
    </section>
  );
}

// ── Social proof bar ───────────────────────────────────────────────
function SocialProofBar() {
  const items = [
    'Built for professional photographers',
    '60+ wedding & event templates',
    'Works on phone, tablet, desktop',
    'Mac + Windows offline apps',
    'Print-ready 300 DPI PDFs',
  ];
  return (
    <div style={{
      borderTop: '1px solid #1a1a1a',
      borderBottom: '1px solid #1a1a1a',
      padding: '18px 28px',
      background: '#0c0c0c',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-around',
        gap: 24,
        fontSize: 11, color: '#666',
        letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600,
      }}>
        {items.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

// ── How it works ───────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { n: 1, title: 'Upload your shoot', body: 'Drag a folder of 30+ photos. The deeper the pool, the smarter the auto-design.' },
    { n: 2, title: 'Click Design All', body: 'AutoBook picks a high-density template per spread and distributes your photos aspect-first. A full book in under 10 seconds.' },
    { n: 3, title: 'Export or share', body: 'Print-ready PDF + JPGs, or send a private review link. Clients leave per-spread notes — no email back-and-forth.' },
  ];
  return (
    <section style={sectionStyle}>
      <SectionLabel>How it works</SectionLabel>
      <h2 style={h2Style}>Three clicks to a finished book</h2>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 18, marginTop: 32,
      }}>
        {steps.map((s) => (
          <div key={s.n} style={{
            padding: '24px 22px',
            background: '#111',
            border: '1px solid #1f1f1f',
            borderRadius: 10,
          }}>
            <div style={{
              fontSize: 28, fontWeight: 700,
              color: '#f6c90e',
              marginBottom: 10,
            }}>
              {String(s.n).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>
              {s.title}
            </div>
            <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.55 }}>
              {s.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Device support ─────────────────────────────────────────────────
function DeviceSupport() {
  const devices = [
    {
      icon: '◰', label: 'Phone',
      tagline: 'iPhone · Android',
      body: 'Full editor in your browser — pinch to zoom, tap to swap photos, swipe between spreads. Review and approve client books on the go.',
      tier: 'All plans',
      tierColor: '#6fcf97',
    },
    {
      icon: '▭', label: 'Tablet',
      tagline: 'iPad · Android tablet',
      body: 'Larger canvas, same touch controls. Perfect for client review meetings — flip through every spread on a screen big enough to actually see the photos.',
      tier: 'All plans',
      tierColor: '#6fcf97',
    },
    {
      icon: '◻', label: 'Browser',
      tagline: 'Any modern browser',
      body: 'Chrome, Safari, Edge, Firefox. Works on Mac, Windows, Linux. Auto-saves to your browser so your project survives refreshes and tab closes.',
      tier: 'All plans',
      tierColor: '#6fcf97',
    },
    {
      icon: '⊞', label: 'Desktop app',
      tagline: 'Mac · Windows · offline',
      body: 'Native installers for when WiFi is unreliable or you need maximum performance. Same projects, same templates — your tier follows your sign-in.',
      tier: 'Pro',
      tierColor: '#f6c90e',
    },
  ];

  return (
    <section style={sectionStyle}>
      <SectionLabel>Every device</SectionLabel>
      <h2 style={h2Style}>Design from wherever you are</h2>
      <p style={{ fontSize: 14, color: '#888', textAlign: 'center', marginTop: 10, maxWidth: 600, margin: '10px auto 0' }}>
        Phone in the car, tablet at the client meeting, desktop in the studio — AutoBook
        is the same editor on all of them, with projects auto-syncing through your account.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 14, marginTop: 32,
      }}>
        {devices.map((d) => (
          <div key={d.label} style={{
            padding: '20px 18px',
            background: '#0e0e0e',
            border: '1px solid #1a1a1a',
            borderRadius: 8,
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 36, color: '#6fb8d8', lineHeight: 1, fontWeight: 300 }}>
                {d.icon}
              </span>
              <span style={{
                fontSize: 9, color: d.tierColor,
                background: d.tier === 'Pro' ? '#3a2a08' : '#0e1a10',
                border: `1px solid ${d.tier === 'Pro' ? '#5a4010' : '#2a4a2a'}`,
                padding: '2px 7px', borderRadius: 3,
                letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600,
              }}>
                {d.tier}
              </span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{d.label}</div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 2, marginBottom: 10 }}>{d.tagline}</div>
            <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.6, flex: 1 }}>
              {d.body}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 22, padding: '14px 18px',
        background: '#0c0c0c', border: '1px solid #1a1a1a',
        borderRadius: 8,
        fontSize: 12, color: '#aaa', lineHeight: 1.6,
        textAlign: 'center',
      }}>
        <strong style={{ color: '#fff' }}>Truly device-agnostic.</strong>{' '}
        Start a book on your phone during a shoot, refine it on your iPad over coffee,
        finish exports on your desktop. Sign in with the same email everywhere — your
        projects follow you.
      </div>
    </section>
  );
}

// ── Feature grid ───────────────────────────────────────────────────
function FeatureGrid() {
  const features = [
    { title: 'AI Design All',
      body: 'One click. Every spread gets a layout. Photos distribute aspect-first across 60+ templates with intelligent density progression.' },
    { title: 'Client proofing portal',
      body: 'Generate an unguessable share link. Clients view in any browser — no signup, no app — and leave notes on every spread you want changed.' },
    { title: 'Wedding & Event templates',
      body: 'Standard, Wedding (19), Event (4), Cover (6), and Print Sizes. New templates ship monthly. Pro tier unlocks everything.' },
    { title: 'Print-ready exports',
      body: '300 DPI JPGs (one per spread, numbered) or a single PDF with CMYK, bleed, and crop marks. Any commercial printer accepts them.' },
    { title: 'White-label branding',
      body: 'Your logo and studio name appear on the client viewer. They see your brand, not ours. Available on Starter and Pro.' },
    { title: 'Pay-per-book pricing',
      body: '₦750 per designed spread + ₦1,000 for the cover. Try one book at fair cost before committing. Pay once, unlock that book forever.' },
    { title: 'Mac + Windows desktop',
      body: 'Native installers for offline work. Same editor, same projects — your tier follows your account across devices. Pro tier.' },
    { title: 'Multi-project workspace',
      body: 'Run 20+ books in parallel from the same browser. Auto-saves continuously to IndexedDB. Switch books mid-session without losing work.' },
  ];
  return (
    <section style={sectionStyle} id="features">
      <SectionLabel>Features</SectionLabel>
      <h2 style={h2Style}>Built for the way studios actually work</h2>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 16, marginTop: 32,
      }}>
        {features.map((f) => (
          <div key={f.title} style={{
            padding: '20px 22px',
            background: '#0e0e0e',
            border: '1px solid #1a1a1a',
            borderRadius: 8,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f6c90e', marginBottom: 6 }}>
              {f.title}
            </div>
            <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6 }}>
              {f.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Pricing ────────────────────────────────────────────────────────
function Pricing({ onTry }) {
  const { code, set, currency, available } = useCurrency();

  return (
    <section style={sectionStyle} id="pricing">
      <SectionLabel>Pricing</SectionLabel>
      <h2 style={h2Style}>One-time payments. No subscriptions.</h2>
      <p style={{ fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8, marginBottom: 18 }}>
        Pay with any major card via Paystack. We auto-detect your currency — switch below if you'd like.
      </p>

      {/* Currency selector */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {available.map((c) => {
          const cur = CURRENCIES[c];
          const active = c === code;
          return (
            <button key={c} onClick={() => set(c)} style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 600,
              background: active ? '#1a3580' : '#161616',
              color: active ? '#fff' : '#aaa',
              border: `1px solid ${active ? '#2a4a90' : '#252525'}`,
              borderRadius: 5, cursor: 'pointer',
              letterSpacing: 0.5,
            }}>
              {cur.flag} {cur.label}
            </button>
          );
        })}
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16, alignItems: 'stretch',
      }}>
        <PlanCard
          name="Pay-per-book"
          badge="One book"
          badgeColor="#6fb8d8" accentBg="#0e2a3a"
          price={formatMoney(currency.spread, code)}
          priceUnit={`/spread + ${formatMoney(currency.cover, code)} cover`}
          tagline="Pay only for what you finish"
          bullets={[
            'Unlimited exports of this book',
            'Add spreads later — pay just for new ones',
            'Client proofing portal',
            'No watermark',
          ]}
          cta="Start designing"
          onClick={onTry}
        />
        <PlanCard
          name="Starter"
          badge="10 books"
          badgeColor="#6fcf97" accentBg="#0e1a10"
          price={formatMoney(currency.starter, code)}
          priceUnit="one-time"
          tagline="2-3 books per quarter"
          bullets={STARTER_FEATURES.map((f) => f.name)}
          cta="Choose Starter"
          onClick={onTry}
        />
        <PlanCard
          highlight
          name="Pro"
          badge="Unlimited + desktop"
          badgeColor="#f6c90e" accentBg="#3a2a08"
          price={formatMoney(currency.pro, code)}
          priceUnit="one-time"
          tagline="Working studios — pays for itself in ~6 books"
          bullets={[
            'Unlimited photobook exports',
            'All templates (Wedding, Event, premium covers)',
            'Mac + Windows desktop apps',
            'White-label branding',
            'Client proofing portal',
            'New templates as we ship them',
          ]}
          cta="Choose Pro"
          onClick={onTry}
        />
      </div>

      {/* Free tier reference */}
      <div style={{
        marginTop: 24, padding: '14px 18px',
        background: '#0c0c0c', border: '1px solid #1a1a1a',
        borderRadius: 8,
        fontSize: 12, color: '#aaa', lineHeight: 1.6,
      }}>
        <strong style={{ color: '#fff' }}>Try free first:</strong> every new account gets{' '}
        <span style={{ color: '#6fcf97' }}>{FREE_FEATURES[0]?.name || '5 trial exports + 30 days full access'}</span>.
        Test everything before you decide.
      </div>
    </section>
  );
}

function PlanCard({ name, badge, badgeColor, accentBg, price, priceUnit, tagline, bullets, cta, onClick, highlight }) {
  return (
    <div style={{
      background: highlight ? '#161208' : '#111',
      border: `1px solid ${highlight ? '#3a2a08' : '#1f1f1f'}`,
      borderRadius: 10,
      padding: '22px 22px 20px',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      {highlight && (
        <span style={{
          position: 'absolute', top: -10, right: 18,
          padding: '3px 10px', borderRadius: 12,
          background: '#3a2a08', color: '#f6c90e',
          fontSize: 9, fontWeight: 700,
          letterSpacing: 0.5, textTransform: 'uppercase',
          border: '1px solid #5a4010',
        }}>Most popular</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: highlight ? '#f6c90e' : '#fff' }}>
          {highlight ? '✦ ' : ''}{name}
        </span>
        <span style={{
          fontSize: 9, color: badgeColor, background: accentBg,
          padding: '3px 8px', borderRadius: 3,
          letterSpacing: 0.5, textTransform: 'uppercase',
        }}>{badge}</span>
      </div>
      <div style={{ marginTop: 14 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: '#fff' }}>{price}</span>
        <span style={{ fontSize: 11, color: '#777', marginLeft: 6 }}>{priceUnit}</span>
      </div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>{tagline}</div>

      <ul style={{ marginTop: 18, padding: 0, listStyle: 'none', flex: 1 }}>
        {bullets.map((b) => (
          <li key={b} style={{ fontSize: 12, color: '#ccc', padding: '5px 0', display: 'flex', gap: 8 }}>
            <span style={{ color: '#6fcf97' }}>✓</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <button onClick={onClick} style={{
        marginTop: 16, padding: '12px',
        fontSize: 13, fontWeight: 600,
        background: highlight ? '#3a2a08' : '#1a3580',
        color: highlight ? '#f6c90e' : '#fff',
        border: highlight ? '1px solid #5a4010' : 'none',
        borderRadius: 6, cursor: 'pointer',
      }}>
        {cta}
      </button>
    </div>
  );
}

// ── FAQ ────────────────────────────────────────────────────────────
function FAQ() {
  const items = [
    { q: 'How does sharing for client review work?',
      a: 'Click Share, generate an unguessable link, send it to your client. They open it in any browser — no signup, no app — and can leave per-spread notes ("swap photos 2 and 3", "use a different cover"). You see every note in your Shares list, grouped by spread.' },
    { q: 'Can I print my books anywhere?',
      a: 'Yes. Export as Print PDF — it includes 300 DPI resolution, CMYK colors, bleed, and crop marks. Drop it into any commercial photobook printer\'s order form, in Lagos or anywhere else.' },
    { q: 'Is the payment really one-time?',
      a: 'Yes. Starter (₦5K) and Pro (₦45K) are both one-time payments. No card on file, no subscriptions, no surprises. Pay once, the tier sticks to your account forever.' },
    { q: 'What does pay-per-book mean?',
      a: 'Instead of upgrading to Starter or Pro, you can pay ₦750 per designed spread plus ₦1,000 for the cover. That specific book is unlocked forever for unlimited exports. Add spreads later? Pay only for the new ones. Great for trying AutoBook with a single project.' },
    { q: 'Where are my photos stored?',
      a: 'In your browser\'s IndexedDB on your own device. We never upload originals. When you share for client review, a 1000-px screen-quality copy goes to our Storage so the viewer can render it. When you export, files download to your local disk. We never see or store your full-resolution photos.' },
    { q: 'Does my client need an account?',
      a: 'No. Anyone with the share link views read-only. No signup, no login. You can revoke the link at any time.' },
    { q: 'What\'s included in the trial?',
      a: 'Every new account gets 5 free exports OR 30 days of full Pro access — whichever ends first. Every template unlocked, every feature available. After trial you keep your projects but lose access to Pro-only templates until you upgrade.' },
    { q: 'Can I work offline?',
      a: 'Yes — with Pro. Download the Mac or Windows desktop app and your projects sync via your AutoBook account. Same editor, no internet required once installed.' },
  ];

  return (
    <section style={sectionStyle} id="faq">
      <SectionLabel>FAQ</SectionLabel>
      <h2 style={h2Style}>Common questions</h2>
      <div style={{ maxWidth: 760, margin: '32px auto 0' }}>
        {items.map((item, i) => (
          <FAQItem key={i} {...item} />
        ))}
      </div>
    </section>
  );
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: '1px solid #1a1a1a',
      padding: '14px 0',
    }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', textAlign: 'left',
        background: 'none', border: 'none',
        color: '#fff', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 0, gap: 16,
      }}>
        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>{q}</span>
        <span style={{ fontSize: 18, color: '#666', flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <p style={{ fontSize: 13, color: '#aaa', lineHeight: 1.7, marginTop: 10, marginBottom: 0 }}>
          {a}
        </p>
      )}
    </div>
  );
}

// ── Final CTA ──────────────────────────────────────────────────────
function FinalCTA({ onTry }) {
  return (
    <section style={{
      padding: '80px 28px',
      textAlign: 'center',
      background: 'linear-gradient(180deg, #0a0a0a 0%, #141008 100%)',
    }}>
      <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, color: '#fff', margin: '0 0 14px', letterSpacing: -0.8 }}>
        Stop fighting Adobe.
      </h2>
      <p style={{ fontSize: 16, color: '#aaa', maxWidth: 540, margin: '0 auto 28px' }}>
        Your next wedding album takes 5 minutes, not 5 hours. Try the editor now — no signup required.
      </p>
      <button onClick={onTry} style={{
        ...ctaPrimary,
        padding: '16px 36px', fontSize: 15,
      }}>
        Open the editor →
      </button>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────
function Footer({ onSupport }) {
  return (
    <footer style={{
      padding: '32px 28px 24px',
      borderTop: '1px solid #1a1a1a',
      color: '#666', fontSize: 11,
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto',
        display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img
            src="./logo.png"
            alt=""
            style={{ height: 32, width: 32, objectFit: 'contain' }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span>© {new Date().getFullYear()} AutoBook by NEJ</span>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <button onClick={onSupport} style={{ ...footerLink, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 11 }}>
            Contact support
          </button>
          <a href="?app=1" style={footerLink}>Open editor</a>
          <a href="#pricing" style={footerLink}>Pricing</a>
          <a href="#faq" style={footerLink}>FAQ</a>
        </div>
      </div>
    </footer>
  );
}

// ── Shared styles ──────────────────────────────────────────────────
const sectionStyle = {
  padding: '64px 28px',
  maxWidth: 1100, margin: '0 auto',
};
const h2Style = {
  fontSize: 'clamp(26px, 3.5vw, 38px)',
  fontWeight: 700, letterSpacing: -0.8,
  color: '#fff',
  textAlign: 'center',
  margin: 0,
};
const ctaPrimary = {
  padding: '10px 18px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff',
  border: 'none', borderRadius: 6,
  cursor: 'pointer',
};
const ctaGhost = {
  padding: '10px 18px', fontSize: 12, fontWeight: 600,
  background: 'transparent', color: '#ccc',
  border: '1px solid #2a2a2a', borderRadius: 6,
  cursor: 'pointer',
};
const navLinkStyle = {
  background: 'none', border: 'none', color: '#aaa',
  fontSize: 12, cursor: 'pointer',
  textDecoration: 'none',
  fontFamily: 'inherit',
};
const footerLink = {
  color: '#888', textDecoration: 'none',
};

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, color: '#f6c90e',
      letterSpacing: 1.5, textTransform: 'uppercase',
      fontWeight: 700,
      textAlign: 'center', marginBottom: 14,
    }}>
      {children}
    </div>
  );
}
