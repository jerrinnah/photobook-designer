import { useBookStore } from '../store/useBookStore';
import { TEMPLATES } from '../layouts/templates';

function getSuggestions(spread, photos, blendEdges) {
  if (!spread) return [];
  const tips = [];
  const geo = spread.cellGeometry || [];
  const filled = spread.cells.filter((c) => c.photoId).length;
  const total = geo.length;
  const empty = total - filled;
  const usedIds = new Set(spread.cells.map((c) => c.photoId).filter(Boolean));
  const available = photos.filter((p) => !usedIds.has(p.id));

  // 1. Empty cells + photos to fill them
  if (empty > 0 && available.length > 0) {
    const n = Math.min(empty, available.length);
    tips.push({
      icon: '⟐',
      color: '#4f8ef7',
      text: `${empty} cell${empty > 1 ? 's' : ''} empty — Auto Arrange will place ${n} photo${n > 1 ? 's' : ''} using best-fit matching`,
    });
  }

  // 2. Aspect ratio mismatches
  const mismatches = spread.cells.filter((c, i) => {
    if (!c.photoId) return false;
    const photo = photos.find((p) => p.id === c.photoId);
    const g = geo[i];
    if (!photo || !g) return false;
    const ca = g.w / g.h;
    const pa = photo.width / photo.height;
    return (ca > 1.2 && pa < 0.85) || (ca < 0.85 && pa > 1.2);
  }).length;

  if (mismatches > 0) {
    tips.push({
      icon: '↔',
      color: '#f6ad55',
      text: `${mismatches} photo${mismatches > 1 ? 's are' : ' is'} portrait in a landscape cell (or vice versa) — drag the border to resize, or use Auto Arrange`,
    });
  }

  // 3. Spread complete — suggest blend or export
  if (filled === total && total > 0 && !blendEdges) {
    tips.push({
      icon: '◈',
      color: '#b89fff',
      text: 'Spread complete — try Blend Edges in the toolbar for a soft editorial fade',
    });
  }

  // 4. More photos than cells
  if (available.length > 0 && empty === 0) {
    const bestFit = TEMPLATES.filter((t) => t.cells.length === filled + available.length).slice(0, 1)[0];
    if (bestFit) {
      tips.push({
        icon: '□',
        color: '#68d391',
        text: `${available.length} unused photo${available.length > 1 ? 's' : ''} — try "${bestFit.name}" layout to fit all ${filled + available.length}`,
      });
    }
  }

  // 5. Layout match suggestion (no photos yet)
  if (filled === 0 && available.length === 0 && photos.length === 0) {
    tips.push({
      icon: '+',
      color: '#718096',
      text: 'Add photos via the left panel, then drag them onto cells — or use Auto Arrange to fill automatically',
    });
  }

  return tips.slice(0, 3);
}

export default function DesignSuggestions() {
  const { spreads, activeSpreadId, photos, blendEdges } = useBookStore();
  const spread = spreads.find((s) => s.id === activeSpreadId);
  const tips = getSuggestions(spread, photos, blendEdges);
  if (tips.length === 0) return null;

  return (
    <div style={{ borderTop: '1px solid #1a1a1a', padding: '10px 12px 14px' }}>
      <div style={{ fontSize: 10, color: '#444', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
        Suggestions
      </div>
      {tips.map((tip, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 13, color: tip.color, flexShrink: 0, marginTop: 1, lineHeight: 1 }}>
            {tip.icon}
          </span>
          <span style={{ fontSize: 11, color: '#666', lineHeight: 1.45 }}>
            {tip.text}
          </span>
        </div>
      ))}
    </div>
  );
}
