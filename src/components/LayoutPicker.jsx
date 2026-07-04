import { useState } from 'react';
import { useBookStore } from '../store/useBookStore';
import { TEMPLATES } from '../layouts/templates';
import DesignSuggestions from './DesignSuggestions';
import SpreadBackground from './SpreadBackground';
import { useLocalStorage } from '../hooks/useLocalStorage';
import CollapsedRail from './CollapsedRail';
import { isPremiumTemplate, getEffectiveTier } from '../utils/premium';
import { useAuthUser } from '../utils/supabase';
import UpgradeModal from './UpgradeModal';
import { useTheme } from '../utils/theme';

const THUMB_W = 76;
const THUMB_H = 38;

function TemplateSVG({ tmpl, active, locked }) {
  const { t } = useTheme();
  const cellFill = active
    ? (t.mode === 'light' ? '#b8c8e8' : '#2a3f6a')
    : locked
      ? (t.mode === 'light' ? '#dcdcdc' : '#252525')
      : (t.mode === 'light' ? '#cfcfcf' : '#2a2a2a');
  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={THUMB_W} height={THUMB_H}
        style={{
          display: 'block',
          border: active ? '2px solid #4f8ef7' : `2px solid ${t.border}`,
          borderRadius: 4,
          background: t.bgPanel2,
          cursor: 'pointer',
          opacity: locked ? 0.55 : 1,
        }}
      >
        {tmpl.cells.map((c, i) => (
          <rect
            key={i}
            x={c.x * THUMB_W + 1} y={c.y * THUMB_H + 1}
            width={c.w * THUMB_W - 2} height={c.h * THUMB_H - 2}
            fill={cellFill}
            rx={1}
          />
        ))}
      </svg>
      {locked && (
        <div style={{
          position: 'absolute', top: 3, right: 3,
          fontSize: 9, color: '#f6c90e',
          background: 'rgba(0,0,0,0.7)',
          padding: '1px 4px', borderRadius: 2,
          pointerEvents: 'none',
        }}>🔒</div>
      )}
    </div>
  );
}

const GROUP_ORDER = ['Print Sizes', 'Single', 'Two–Three', 'Four–Five', 'Six–Seven', 'Eight–Eleven', 'Twelve–Fourteen', 'Fifteen–Seventeen', '18+ Dense'];

export default function LayoutPicker({ mobile = false }) {
  const { t } = useTheme();
  const { spreads, activeSpreadId, setTemplate } = useBookStore();
  const spread = spreads.find((s) => s.id === activeSpreadId);
  const [catFilter, setCatFilter] = useState('all'); // 'all' | 'Standard' | 'Wedding' | 'Event' | 'Print'
  const [collapsed, setCollapsed] = useLocalStorage('layoutpicker-collapsed', false);
  const [upgradeFor, setUpgradeFor] = useState(null);
  const user = useAuthUser();
  const effectiveTier = getEffectiveTier(user);

  const handleTemplateClick = (tmpl) => {
    if (isPremiumTemplate(tmpl, effectiveTier)) {
      setUpgradeFor(`"${tmpl.name}" template`);
      return;
    }
    setTemplate(activeSpreadId, tmpl.id);
  };

  if (!mobile && collapsed) {
    return <CollapsedRail label="Layouts" side="right" onExpand={() => setCollapsed(false)} />;
  }

  // Newer "life-event" categories added in Tier 4 — grouped together
  // under the same Events filter tab to keep the UI compact.
  const LIFE_EVENT_CATEGORIES = ['Event', 'Engagement', 'Baby Shower', 'Birthday', 'Corporate', 'Memorial', 'Christening'];

  const visibleTemplates = TEMPLATES.filter((tmpl) => {
    if (catFilter === 'all') return true;
    if (catFilter === 'Cover') return tmpl.category === 'Cover';
    if (catFilter === 'Print') return tmpl.printSize;
    if (catFilter === 'Wedding') return tmpl.category === 'Wedding';
    if (catFilter === 'Event') return LIFE_EVENT_CATEGORIES.includes(tmpl.category);
    return !tmpl.printSize && !tmpl.category; // Standard
  });

  const groups = visibleTemplates.reduce((acc, tmpl) => {
    const n = tmpl.cells.length;
    let label;
    if (tmpl.category === 'Cover') {
      label = 'Cover';
    } else if (tmpl.category === 'Wedding') {
      label = 'Wedding';
    } else if (LIFE_EVENT_CATEGORIES.includes(tmpl.category)) {
      // Preserve original category name as its own group header so
      // Engagement, Baby Shower, etc. get their own sections.
      label = tmpl.category;
    } else if (tmpl.printSize) {
      label = 'Print Sizes';
    } else {
      label = n === 1 ? 'Single' : n <= 3 ? 'Two–Three' : n <= 5 ? 'Four–Five' :
              n <= 7 ? 'Six–Seven' : n <= 11 ? 'Eight–Eleven' :
              n <= 14 ? 'Twelve–Fourteen' : n <= 17 ? 'Fifteen–Seventeen' : '18+ Dense';
    }
    if (!acc[label]) acc[label] = [];
    acc[label].push(tmpl);
    return acc;
  }, {});

  const WEDDING_ORDER = ['Wedding'];
  const EVENT_ORDER = ['Engagement', 'Baby Shower', 'Birthday', 'Christening', 'Corporate', 'Memorial', 'Event'];
  const ALL_ORDER = ['Cover', 'Wedding', ...EVENT_ORDER, 'Print Sizes', 'Single', 'Two–Three', 'Four–Five', 'Six–Seven', 'Eight–Eleven', 'Twelve–Fourteen', 'Fifteen–Seventeen', '18+ Dense'];
  const sortedLabels = catFilter === 'Wedding'
    ? WEDDING_ORDER.filter((k) => groups[k])
    : catFilter === 'Event'
      ? EVENT_ORDER.filter((k) => groups[k])
      : ALL_ORDER.filter((k) => groups[k]);

  return (
    <aside data-tour="layouts" style={{ width: mobile ? '100%' : 200, height: mobile ? '100%' : undefined, background: t.bgPanel, borderLeft: mobile ? 'none' : `1px solid ${t.divider}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 8px 6px 12px' }}>
        <span style={{ fontSize: 10, color: t.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Layout</span>
        {!mobile && (
          <button onClick={() => setCollapsed(true)} title="Collapse panel" style={{
            background: 'none', border: 'none', color: t.textFaint,
            fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}>›</button>
        )}
      </div>

      {/* Category filter tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.divider}`, marginBottom: 4, flexWrap: 'wrap' }}>
        {[['all','All'],['Cover','Cover'],['Standard','Std'],['Wedding','Wed'],['Event','Evt'],['Print','Print']].map(([key, label]) => (
          <button key={key}
            onClick={() => setCatFilter(key)}
            style={{
              flex: 1, padding: '4px 0', fontSize: 8.5, letterSpacing: 0.3,
              background: catFilter === key ? (t.mode === 'light' ? '#e6edf8' : '#1e2535') : 'transparent',
              color: catFilter === key
                ? (key === 'Wedding' ? '#f6c9a0' : key === 'Event' ? '#9ad' : key === 'Cover' ? '#e8b87a' : '#4f8ef7')
                : t.textMuted,
              border: 'none',
              borderBottom: catFilter === key
                ? `1px solid ${key === 'Wedding' ? '#c08040' : key === 'Event' ? '#4a7a9d' : key === 'Cover' ? '#a07a30' : '#4f8ef7'}`
                : `1px solid ${t.divider}`,
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 8px' }}>
        {sortedLabels.map((label) => (
          <div key={label}>
            <div style={{
              fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
              marginBottom: 5, marginTop: 4,
              color: label === 'Print Sizes' ? '#4a7a4a' : label === '18+ Dense' ? '#c9a227'
                : label === 'Wedding' ? '#c08040'
                : label === 'Engagement' ? '#e8a0a0'
                : label === 'Baby Shower' ? '#a8c8e8'
                : label === 'Birthday' ? '#f6c98a'
                : label === 'Christening' ? '#c8b0e8'
                : label === 'Corporate' ? '#8fb8cf'
                : label === 'Memorial' ? '#a89f8f'
                : label === 'Event' ? '#4a7a9d'
                : label === 'Cover' ? '#a07a30' : t.textFaint,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {label === 'Print Sizes' && <span style={{ color: '#4a7a4a' }}>⬛</span>}
              {label === '18+ Dense' && <span>⚡</span>}
              {label === 'Wedding' && <span>♥</span>}
              {label === 'Engagement' && <span>❦</span>}
              {label === 'Baby Shower' && <span>◒</span>}
              {label === 'Birthday' && <span>✿</span>}
              {label === 'Christening' && <span>✝</span>}
              {label === 'Corporate' && <span>■</span>}
              {label === 'Memorial' && <span>❋</span>}
              {label === 'Event' && <span>★</span>}
              {label === 'Cover' && <span>✦</span>}
              {label}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
              {groups[label].map((tmpl) => (
                <div key={tmpl.id} onClick={() => handleTemplateClick(tmpl)}>
                  <TemplateSVG tmpl={tmpl} active={spread?.templateId === tmpl.id} locked={isPremiumTemplate(tmpl, effectiveTier)} />
                  <div style={{ fontSize: 9, color: t.textMuted, marginTop: 3, textAlign: 'center', lineHeight: 1.2 }}>
                    {tmpl.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SpreadBackground />
      <DesignSuggestions />
      <UpgradeModal open={Boolean(upgradeFor)} blockedFeature={upgradeFor} onClose={() => setUpgradeFor(null)} />
    </aside>
  );
}
