import { useState, useEffect, useRef } from 'react';

// First-run product tour. Highlights a sequence of UI elements with a
// short description for each. Auto-starts the first time a visitor lands
// on the editor; can be replayed from the profile menu.
//
// Each step either anchors to a DOM element by `selector` (drawn as a
// cutout + tooltip) or, with no selector, renders centered on screen as
// a welcome / wrap-up message.

const TOUR_KEY = 'photobook-tour-v1';

const STEPS = [
  {
    title: 'Welcome to AutoBook',
    body: "60-second walkthrough of the editor. You can skip at any time — re-run later from your profile menu.",
  },
  {
    selector: '[data-tour="book-name"]',
    title: 'Name your book',
    body: 'Appears in your exports (filenames) and at the top of the share link your clients see.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="photos"]',
    title: 'Upload your photos',
    body: 'Drag a folder of 30+ photos into this panel. The deeper the pool, the smarter the auto-design.',
    placement: 'right',
  },
  {
    selector: '[data-tour="layouts"]',
    title: 'Pick a template',
    body: 'Browse 60+ layouts: Wedding, Event, Cover, Standard. Click any template to apply it to the current spread.',
    placement: 'left',
  },
  {
    selector: '[data-tour="design-all"]',
    title: 'Design All — the magic button',
    body: 'One click. Every spread gets a high-density layout and your photos distribute aspect-first. A full book in seconds.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="reshuffle"]',
    title: 'Reshuffle current spread',
    body: 'If there are empty cells, fills them with the next unplaced photos. Otherwise shuffles what\'s already on this spread.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="redesign"]',
    title: 'Redesign this spread',
    body: 'Pick a new template for just this spread and re-fill it. Try a few until one clicks.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="preview"]',
    title: 'Preview the book',
    body: 'Full-screen walkthrough — exactly what your client will see.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="share"]',
    title: 'Share for client review',
    body: 'Generate an unguessable link. Your client opens it without an account and can leave notes on every spread.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="export"]',
    title: 'Export print-ready files',
    body: 'JPGs (one per spread) or a single PDF with crop marks and bleed. 300 DPI, ready for any printer.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="projects"]',
    title: 'All your projects',
    body: 'Switch between books, duplicate, delete, or download a portable backup. Everything auto-saves between sessions.',
    placement: 'bottom',
  },
  {
    selector: '[data-tour="profile"]',
    title: 'Your account',
    body: 'Sign in to save across devices, set a password to skip magic links, and unlock Premium templates.',
    placement: 'bottom',
  },
  {
    title: "You're ready",
    body: "Drop in some photos, hit Design All, and you'll have a draft book in seconds. The whole tour lives in your profile menu if you ever want to re-watch.",
  },
];

export function hasSeenTour() {
  try { return localStorage.getItem(TOUR_KEY) === 'completed'; }
  catch { return true; }
}
export function markTourSeen() {
  try { localStorage.setItem(TOUR_KEY, 'completed'); } catch { /* ignore */ }
}
export function resetTour() {
  try { localStorage.removeItem(TOUR_KEY); } catch { /* ignore */ }
}

export default function Tour({ open, onClose }) {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const tickRef = useRef(null);

  useEffect(() => {
    if (!open) { setStep(0); return; }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const current = STEPS[step];
    if (!current?.selector) { setRect(null); return; }
    const update = () => {
      const el = document.querySelector(current.selector);
      if (el) {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); } catch { /* ignore */ }
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    // Re-check periodically in case the layout shifts (e.g., async images loading)
    tickRef.current = setInterval(update, 500);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      clearInterval(tickRef.current);
    };
  }, [open, step]);

  if (!open) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) { markTourSeen(); onClose(); }
    else setStep((s) => s + 1);
  };
  const handleSkip = () => { markTourSeen(); onClose(); };
  const handleBack = () => step > 0 && setStep((s) => s - 1);

  const tipStyle = computeTipPosition(rect, current.selector ? current.placement || 'bottom' : 'center');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9990,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      pointerEvents: 'none',
    }}>
      {/* Backdrop — either full-screen dim (for center-placed steps) or cutout */}
      {current.selector && rect ? (
        <div style={{
          position: 'fixed',
          top: rect.top - 6, left: rect.left - 6,
          width: rect.width + 12, height: rect.height + 12,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)',
          border: '2px solid #4f8ef7',
          borderRadius: 6,
          pointerEvents: 'none',
          transition: 'all 220ms ease',
        }} />
      ) : (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.78)',
          pointerEvents: 'auto',
        }} onClick={handleSkip} />
      )}

      {/* Tooltip card */}
      <div style={{
        position: 'fixed',
        ...tipStyle,
        width: 320, maxWidth: '90vw',
        background: '#111',
        border: '1px solid #2a2a2a',
        borderRadius: 8,
        padding: '16px 18px',
        color: '#e0e0e0',
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
        pointerEvents: 'auto',
        transition: 'top 220ms ease, left 220ms ease',
      }}>
        <div style={{ fontSize: 10, color: '#4f8ef7', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
          Step {step + 1} of {STEPS.length}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, color: '#f0f0f0' }}>{current.title}</div>
        <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.55, marginBottom: 16 }}>{current.body}</div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap' }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 18 : 6, height: 6,
              borderRadius: 3,
              background: i === step ? '#4f8ef7' : i < step ? '#2a4a7a' : '#262626',
              transition: 'all 220ms ease',
            }} />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
          <button onClick={handleSkip} style={btnGhost}>Skip</button>
          {step > 0 && <button onClick={handleBack} style={btnGhost}>Back</button>}
          <button onClick={handleNext} style={btnPrimary}>
            {isLast ? "Let's go" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Position the tooltip relative to the highlighted rect. Falls back to
// safe boundaries so the card never goes off-screen.
function computeTipPosition(rect, placement) {
  const TIP_W = 320;
  const TIP_H = 220; // approximate height; we just want collision avoidance
  const GAP = 16;
  const MIN = 12;
  const maxLeft = window.innerWidth - TIP_W - MIN;
  const maxTop = window.innerHeight - TIP_H - MIN;

  if (!rect || placement === 'center') {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  let top, left;
  switch (placement) {
    case 'bottom':
      top = rect.bottom + GAP;
      left = rect.left + rect.width / 2 - TIP_W / 2;
      if (top > maxTop) top = Math.max(MIN, rect.top - TIP_H - GAP);
      break;
    case 'top':
      top = rect.top - TIP_H - GAP;
      left = rect.left + rect.width / 2 - TIP_W / 2;
      if (top < MIN) top = rect.bottom + GAP;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - TIP_H / 2;
      left = rect.right + GAP;
      if (left > maxLeft) left = Math.max(MIN, rect.left - TIP_W - GAP);
      break;
    case 'left':
      top = rect.top + rect.height / 2 - TIP_H / 2;
      left = rect.left - TIP_W - GAP;
      if (left < MIN) left = rect.right + GAP;
      break;
    default:
      top = rect.bottom + GAP;
      left = rect.left;
  }
  return {
    top: Math.max(MIN, Math.min(maxTop, top)),
    left: Math.max(MIN, Math.min(maxLeft, left)),
  };
}

const btnPrimary = {
  padding: '7px 14px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 5, cursor: 'pointer',
};
const btnGhost = {
  padding: '7px 12px', fontSize: 11,
  background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
