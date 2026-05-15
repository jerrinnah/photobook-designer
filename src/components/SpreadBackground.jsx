import { useRef } from 'react';
import { useBookStore } from '../store/useBookStore';

const cssGrad = (type, angle, stops) => {
  if (type === 'radial') return `radial-gradient(ellipse at center, ${stops[0]}, ${stops[1]})`;
  if (type === 'vignette') return `radial-gradient(ellipse at center, ${stops[1]}, ${stops[0]})`;
  return `linear-gradient(${angle}deg, ${stops[0]}, ${stops[1]})`;
};

const hexToRgba = (hex, alpha) => {
  if (!hex || hex.length < 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const GRAD_PRESETS = [
  { name: 'Midnight', stops: ['#05050f', '#151530'], angle: 180, type: 'linear' },
  { name: 'Charcoal', stops: ['#111111', '#040404'], angle: 90,  type: 'linear' },
  { name: 'Dusk',     stops: ['#1e0a2e', '#05050a'], angle: 135, type: 'linear' },
  { name: 'Ocean',    stops: ['#05102a', '#0a2045'], angle: 180, type: 'linear' },
  { name: 'Forest',   stops: ['#050f05', '#0d200d'], angle: 180, type: 'linear' },
  { name: 'Ember',    stops: ['#1f0500', '#300a00'], angle: 150, type: 'linear' },
  { name: 'Slate',    stops: ['#0f1825', '#1a2a3a'], angle: 135, type: 'linear' },
  { name: 'Chalk',    stops: ['#f5f2ec', '#dedad2'], angle: 180, type: 'linear' },
  { name: 'Ivory',    stops: ['#fdfcf8', '#edeadf'], angle: 135, type: 'linear' },
  { name: 'Glow',     stops: ['#2a1a3a', '#050508'], angle: 0,   type: 'radial'  },
  { name: 'Halo',     stops: ['#f5f2ec', '#1a1a1a'], angle: 0,   type: 'radial'  },
  { name: 'Dark Vig', stops: ['#050505', '#111111'], angle: 0,   type: 'vignette'},
];

const ANGLES = [
  { label: '↓', v: 180 }, { label: '→', v: 90  },
  { label: '↗', v: 45  }, { label: '↘', v: 135 },
  { label: '↑', v: 0   }, { label: '←', v: 270 },
  { label: '↙', v: 225 }, { label: '↖', v: 315 },
];

const OVERLAY_PRESETS = [
  { label: 'None',    overlay: null },
  { label: '↓ Dark',  overlay: { type: 'linear', angle: 180, color: '#000000', opacity: 0.65 } },
  { label: '↑ Dark',  overlay: { type: 'linear', angle: 0,   color: '#000000', opacity: 0.65 } },
  { label: '→ Dark',  overlay: { type: 'linear', angle: 90,  color: '#000000', opacity: 0.65 } },
  { label: 'Vignette',overlay: { type: 'vignette', angle: 0, color: '#000000', opacity: 0.75 } },
  { label: 'Haze',    overlay: { type: 'radial',   angle: 0, color: '#000000', opacity: 0.5  } },
  { label: '↓ White', overlay: { type: 'linear', angle: 180, color: '#ffffff', opacity: 0.6  } },
  { label: 'Warm',    overlay: { type: 'linear', angle: 135, color: '#7a3000', opacity: 0.35 } },
  { label: 'Cool',    overlay: { type: 'linear', angle: 135, color: '#002050', opacity: 0.35 } },
];

const GRAD_TYPES = [
  { id: 'linear',  label: 'Linear' },
  { id: 'radial',  label: 'Radial' },
  { id: 'vignette',label: 'Vignette' },
];

const tabStyle = (active) => ({
  flex: 1, padding: '4px 0', fontSize: 10, letterSpacing: 0.5,
  textTransform: 'uppercase',
  background: active ? '#1e2535' : 'transparent',
  color: active ? '#4f8ef7' : '#444',
  border: 'none', borderBottom: active ? '1px solid #4f8ef7' : '1px solid #222',
  cursor: 'pointer',
});

const smBtn = (active) => ({
  padding: '3px 6px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
  background: active ? '#1e2535' : '#181818',
  color: active ? '#4f8ef7' : '#555',
  border: `1px solid ${active ? '#4f8ef7' : '#252525'}`,
});

export default function SpreadBackground() {
  const {
    spreads, activeSpreadId,
    setSpreadBgColor, setSpreadBgGradient, setSpreadBgImage,
    setSpreadBgMode, setSpreadBgOverlay,
  } = useBookStore();

  const spread = spreads.find((s) => s.id === activeSpreadId);
  const fileRef = useRef(null);
  if (!spread) return null;

  const mode = spread.bgMode || 'color';
  const grad = spread.bgGradient || { type: 'linear', angle: 180, stops: ['#111111', '#050505'] };
  const overlay = spread.bgOverlay;

  const handleImageFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSpreadBgImage(activeSpreadId, ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const setAngle = (angle) =>
    setSpreadBgGradient(activeSpreadId, { ...grad, angle });

  const setGradType = (type) =>
    setSpreadBgGradient(activeSpreadId, { ...grad, type });

  const setStop = (idx, color) => {
    const stops = [...grad.stops];
    stops[idx] = color;
    setSpreadBgGradient(activeSpreadId, { ...grad, stops });
  };

  const previewBg = (p) => cssGrad(p.type || 'linear', p.angle, p.stops);

  return (
    <div style={{ borderTop: '1px solid #1a1a1a' }}>
      <div style={{ padding: '10px 12px 6px', fontSize: 10, color: '#444', letterSpacing: 1, textTransform: 'uppercase' }}>
        Background
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1a1a1a', margin: '0 0 8px' }}>
        {[['color','Solid'],['gradient','Gradient'],['image','Image']].map(([key, label]) => (
          <button key={key} style={tabStyle(mode === key)} onClick={() => setSpreadBgMode(activeSpreadId, key)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 10px 12px' }}>

        {/* ── Solid ── */}
        {mode === 'color' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="color" value={spread.bgColor || '#111111'}
              onChange={(e) => setSpreadBgColor(activeSpreadId, e.target.value)}
              style={{ width: 36, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            <span style={{ fontSize: 11, color: '#555', fontFamily: 'monospace' }}>
              {(spread.bgColor || '#111111').toUpperCase()}
            </span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {['#000000','#111111','#1a1a1a','#ffffff','#f5f2ec','#fdfcf8'].map((c) => (
                <div key={c} onClick={() => setSpreadBgColor(activeSpreadId, c)} title={c}
                  style={{ width: 16, height: 16, background: c, borderRadius: 2, cursor: 'pointer',
                    border: (spread.bgColor || '#111111') === c ? '2px solid #4f8ef7' : '1px solid #333' }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Gradient ── */}
        {mode === 'gradient' && (
          <>
            {/* Gradient type */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {GRAD_TYPES.map(({ id, label }) => (
                <button key={id} style={smBtn((grad.type || 'linear') === id)}
                  onClick={() => setGradType(id)}>{label}</button>
              ))}
            </div>

            {/* Preset swatches */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 10 }}>
              {GRAD_PRESETS.map((p) => {
                const active = grad.stops[0] === p.stops[0] && grad.stops[1] === p.stops[1] && (grad.type||'linear') === p.type;
                return (
                  <div key={p.name} title={p.name}
                    onClick={() => setSpreadBgGradient(activeSpreadId, { type: p.type, angle: p.angle, stops: p.stops })}
                    style={{ height: 24, background: previewBg(p), borderRadius: 3, cursor: 'pointer',
                      border: active ? '2px solid #4f8ef7' : '1px solid #1a1a1a' }} />
                );
              })}
            </div>

            {/* Direction (linear only) */}
            {(grad.type || 'linear') === 'linear' && (
              <>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Direction</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, marginBottom: 10 }}>
                  {ANGLES.map(({ label, v }) => (
                    <button key={v} style={smBtn(grad.angle === v)} onClick={() => setAngle(v)}>{label}</button>
                  ))}
                </div>
              </>
            )}

            {/* Custom colour stops */}
            <div style={{ fontSize: 9, color: '#444', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>Colours</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={grad.stops[0]} onChange={(e) => setStop(0, e.target.value)}
                style={{ width: 36, height: 26, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
              <div style={{ flex: 1, height: 16, borderRadius: 3,
                background: cssGrad(grad.type || 'linear', 90, grad.stops) }} />
              <input type="color" value={grad.stops[1]} onChange={(e) => setStop(1, e.target.value)}
                style={{ width: 36, height: 26, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
            </div>
          </>
        )}

        {/* ── Image ── */}
        {mode === 'image' && (
          <>
            {spread.bgImage ? (
              <div style={{ position: 'relative', marginBottom: 8 }}>
                <img src={spread.bgImage} alt="bg"
                  style={{ width: '100%', height: 52, objectFit: 'cover', borderRadius: 4, display: 'block' }} />
                <button onClick={() => setSpreadBgImage(activeSpreadId, null)}
                  style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.7)', border: 'none',
                    color: '#aaa', fontSize: 11, cursor: 'pointer', borderRadius: 3, padding: '2px 6px', lineHeight: 1 }}>
                  ✕
                </button>
              </div>
            ) : (
              <div onClick={() => fileRef.current?.click()}
                style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '1px dashed #2a2a2a', borderRadius: 4, cursor: 'pointer', color: '#444', fontSize: 11, marginBottom: 8 }}>
                + Choose image
              </div>
            )}
            <button onClick={() => fileRef.current?.click()}
              style={{ width: '100%', padding: '5px 0', background: '#181818', border: '1px solid #252525',
                borderRadius: 4, color: '#666', fontSize: 11, cursor: 'pointer', marginBottom: 10 }}>
              {spread.bgImage ? 'Replace image' : 'Upload image'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />

            {/* Overlay section */}
            <div style={{ fontSize: 9, color: '#444', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
              Gradient Overlay
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, marginBottom: 8 }}>
              {OVERLAY_PRESETS.map((p) => {
                const active = JSON.stringify(overlay) === JSON.stringify(p.overlay);
                const previewStyle = p.overlay
                  ? { background: cssGrad(p.overlay.type, p.overlay.angle,
                      [hexToRgba(p.overlay.color, 0), hexToRgba(p.overlay.color, p.overlay.opacity)]) }
                  : { background: 'repeating-linear-gradient(45deg,#1a1a1a 0,#1a1a1a 4px,#111 4px,#111 8px)' };
                return (
                  <div key={p.label} onClick={() => setSpreadBgOverlay(activeSpreadId, p.overlay)}
                    style={{ ...previewStyle, height: 28, borderRadius: 3, cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      border: active ? '2px solid #4f8ef7' : '1px solid #1a1a1a' }}>
                    <span style={{ fontSize: 9, color: '#ccc', textShadow: '0 1px 3px #000', letterSpacing: 0.3 }}>
                      {p.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Overlay opacity */}
            {overlay && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 9, color: '#444', whiteSpace: 'nowrap' }}>Opacity</span>
                <input type="range" min={0.05} max={1} step={0.05} value={overlay.opacity}
                  onChange={(e) => setSpreadBgOverlay(activeSpreadId, { ...overlay, opacity: parseFloat(e.target.value) })}
                  style={{ flex: 1, accentColor: '#4f8ef7' }} />
                <span style={{ fontSize: 9, color: '#555', minWidth: 26, textAlign: 'right' }}>
                  {Math.round(overlay.opacity * 100)}%
                </span>
                <input type="color" value={overlay.color}
                  onChange={(e) => setSpreadBgOverlay(activeSpreadId, { ...overlay, color: e.target.value })}
                  style={{ width: 24, height: 20, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
