import { useState, useEffect } from 'react';
import { getStoredUser, updateBrand } from '../utils/supabase';
import { getEffectiveTier } from '../utils/premium';

export default function BrandingSettings({ open, onClose }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4f8ef7');
  const [logoUrl, setLogoUrl] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  const user = getStoredUser();
  const isPremium = getEffectiveTier(user) !== 'free';

  useEffect(() => {
    if (!open) return;
    setName(user?.brand?.name || '');
    setColor(user?.brand?.color || '#4f8ef7');
    setLogoUrl(user?.brand?.logoUrl || '');
    setSiteUrl(user?.brand?.siteUrl || '');
    setSaved(false);
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    if (!isPremium || saving) return;
    setError(null);
    setSaving(true);
    try {
      await updateBrand({ name, color, logoUrl, siteUrl });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!isPremium || saving) return;
    if (!confirm('Clear all branding and revert to AutoBook defaults?')) return;
    setSaving(true);
    try {
      await updateBrand({ name: null, color: null, logoUrl: null, siteUrl: null });
      setName(''); setColor('#4f8ef7'); setLogoUrl(''); setSiteUrl('');
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
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
        width: 460, maxWidth: '94vw',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Brand settings</span>
          {!isPremium && (
            <span style={{ fontSize: 9, color: '#f6c90e', background: '#3a2a08', padding: '2px 8px', borderRadius: 3, letterSpacing: 0.5 }}>
              ✦ PREMIUM
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 18, lineHeight: 1.5 }}>
          {isPremium
            ? 'Replace the AutoBook logo, watermark, and PDF spec sheet with your own brand. Visible to anyone you export to.'
            : 'Upgrade to Premium to replace the AutoBook logo, watermark, and PDF spec sheet with your own brand.'}
        </div>

        <Field label="Brand name" hint="Shown as 'Designed with [name]' on PDF spec sheet">
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Studio Aurora" disabled={!isPremium} style={inputStyle}
          />
        </Field>

        <Field label="Website" hint="Shown on watermark + spec sheet">
          <input
            type="url" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://studioaurora.com" disabled={!isPremium} style={inputStyle}
          />
        </Field>

        <Field label="Logo URL" hint="Direct URL to PNG/SVG. Shown in the toolbar.">
          <input
            type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png" disabled={!isPremium} style={inputStyle}
          />
        </Field>

        <Field label="Brand color" hint="Used for accent highlights">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="color" value={color} onChange={(e) => setColor(e.target.value)}
              disabled={!isPremium}
              style={{ width: 44, height: 32, border: 'none', background: 'none', cursor: isPremium ? 'pointer' : 'not-allowed', padding: 0 }}
            />
            <input
              type="text" value={color} onChange={(e) => setColor(e.target.value)}
              disabled={!isPremium}
              style={{ ...inputStyle, fontFamily: 'monospace', flex: 1 }}
            />
          </div>
        </Field>

        {/* Preview */}
        <div style={{
          marginTop: 6, marginBottom: 14,
          padding: '10px 12px',
          background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 6,
        }}>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            Preview
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="logo" style={{ height: 28, width: 28, objectFit: 'contain', borderRadius: '50%', background: '#181818' }} />
            ) : (
              <div style={{ height: 28, width: 28, borderRadius: '50%', background: color || '#1a3580', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: 12 }}>
                {(name || 'N').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 600, color: '#ddd' }}>
              {name || 'AutoBook by NEJ'}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 10, color: color || '#4f8ef7' }}>
              {siteUrl || 'autobookbynej.online'}
            </div>
          </div>
        </div>

        {saved && (
          <div style={{ padding: '8px 10px', marginBottom: 10, background: '#0e1a10', border: '1px solid #2a4a2a', color: '#6fcf97', fontSize: 11, borderRadius: 5 }}>
            ✓ Saved. New exports will use your brand.
          </div>
        )}
        {error && (
          <div style={{ padding: '8px 10px', marginBottom: 10, background: '#1a0808', border: '1px solid #5a1a1a', color: '#e05c5c', fontSize: 11, borderRadius: 5 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <button onClick={handleClear} disabled={!isPremium || saving} style={btnGhost}>
            Reset to default
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnGhost}>Close</button>
            <button onClick={handleSave} disabled={!isPremium || saving} style={{
              ...btnPrimary,
              opacity: (!isPremium || saving) ? 0.5 : 1,
              cursor: (!isPremium || saving) ? 'not-allowed' : 'pointer',
            }}>
              {saving ? 'Saving…' : 'Save brand'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 10, color: '#666', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </span>
      {children}
      {hint && (
        <span style={{ display: 'block', fontSize: 10, color: '#555', marginTop: 3 }}>{hint}</span>
      )}
    </label>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: '#181818', border: '1px solid #252525',
  borderRadius: 5, color: '#ddd', fontSize: 12,
  padding: '7px 10px', outline: 'none',
};
const btnPrimary = {
  padding: '8px 14px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 5, cursor: 'pointer',
};
const btnGhost = {
  padding: '8px 12px', fontSize: 11,
  background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
