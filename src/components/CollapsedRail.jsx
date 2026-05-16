// 28px-wide collapsed sidebar rail with vertical label and expand button.
export default function CollapsedRail({ label, side, onExpand }) {
  const arrow = side === 'left' ? '›' : '‹';
  return (
    <div style={{
      width: 28,
      background: '#0e0e0e',
      borderRight: side === 'left' ? '1px solid #1a1a1a' : 'none',
      borderLeft: side === 'right' ? '1px solid #1a1a1a' : 'none',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '6px 0',
      flexShrink: 0,
      cursor: 'pointer',
      transition: 'background 0.15s',
    }}
    onClick={onExpand}
    onMouseEnter={(e) => { e.currentTarget.style.background = '#161616'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = '#0e0e0e'; }}
    title={`Expand ${label}`}
    >
      <div style={{
        color: '#555', fontSize: 14, padding: '4px 0', lineHeight: 1,
      }}>{arrow}</div>
      <div style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        writingMode: 'vertical-rl',
        transform: 'rotate(180deg)',
        fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        color: '#555',
        marginTop: 8,
      }}>{label}</div>
    </div>
  );
}
