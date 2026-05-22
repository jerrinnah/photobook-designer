import { useState, useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Image as KImage, Group, Text as KText, Circle } from 'react-konva';
import { useBookStore } from '../store/useBookStore';
import { getScreenDims } from '../layouts/spreadSizes';
import useImage from '../hooks/useImage';

function gradientPoints(angle, w, h) {
  const rad = (angle * Math.PI) / 180;
  const cx = w / 2, cy = h / 2;
  const r = Math.sqrt(cx * cx + cy * cy);
  return {
    start: { x: cx - Math.cos(rad) * r, y: cy - Math.sin(rad) * r },
    end:   { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r },
  };
}

function SpreadBgImage({ src, w, h }) {
  const [img] = useImage(src);
  if (!img) return <Rect x={0} y={0} width={w} height={h} fill="#111" />;
  const scale = Math.max(w / img.width, h / img.height);
  const iw = img.width * scale, ih = img.height * scale;
  return <KImage image={img} x={(w - iw) / 2} y={(h - ih) / 2} width={iw} height={ih} listening={false} />;
}

const hexToRgba = (hex, alpha) => {
  if (!hex || hex.length < 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

function PreviewSpreadBg({ spread, w, h }) {
  const { bgMode, bgColor, bgGradient, bgImage, bgOverlay } = spread;

  const renderGradRect = (g, width, height) => {
    const type = g.type || 'linear';
    const stops = g.stops || ['#111', '#050505'];
    if (type === 'radial') {
      return <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width/2, y: height/2 }} fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: width/2, y: height/2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.75}
        fillRadialGradientColorStops={[0, stops[0], 1, stops[1]]} />;
    }
    if (type === 'vignette') {
      return <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width/2, y: height/2 }}
        fillRadialGradientStartRadius={Math.min(width, height) * 0.25}
        fillRadialGradientEndPoint={{ x: width/2, y: height/2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.75}
        fillRadialGradientColorStops={[0, stops[1], 1, stops[0]]} />;
    }
    const pts = gradientPoints(g.angle || 180, width, height);
    return <Rect x={0} y={0} width={width} height={height} listening={false}
      fillLinearGradientStartPoint={pts.start} fillLinearGradientEndPoint={pts.end}
      fillLinearGradientColorStops={[0, stops[0], 1, stops[1]]} />;
  };

  const renderOverlay = (ov, width, height) => {
    const transparent = hexToRgba(ov.color, 0);
    const opaque = hexToRgba(ov.color, ov.opacity);
    if (ov.type === 'vignette') {
      return <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width/2, y: height/2 }}
        fillRadialGradientStartRadius={Math.min(width, height) * 0.2}
        fillRadialGradientEndPoint={{ x: width/2, y: height/2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.75}
        fillRadialGradientColorStops={[0, transparent, 1, opaque]} />;
    }
    if (ov.type === 'radial') {
      return <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width/2, y: height/2 }} fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: width/2, y: height/2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.7}
        fillRadialGradientColorStops={[0, opaque, 1, transparent]} />;
    }
    const pts = gradientPoints(ov.angle || 180, width, height);
    return <Rect x={0} y={0} width={width} height={height} listening={false}
      fillLinearGradientStartPoint={pts.start} fillLinearGradientEndPoint={pts.end}
      fillLinearGradientColorStops={[0, transparent, 1, opaque]} />;
  };

  if (bgMode === 'gradient' && bgGradient) return renderGradRect(bgGradient, w, h);
  if (bgMode === 'image' && bgImage) return (
    <>{<SpreadBgImage src={bgImage} w={w} h={h} />}{bgOverlay && renderOverlay(bgOverlay, w, h)}</>
  );
  return <Rect x={0} y={0} width={w} height={h} fill={bgColor || '#111'} listening={false} />;
}

function PreviewCellGrad({ g, x, y, w, h }) {
  if (!g) return null;
  const opaque = hexToRgba(g.color || '#000000', g.opacity ?? 0.65);
  const trans  = hexToRgba(g.color || '#000000', 0);
  if (g.type === 'vignette') {
    return <Rect x={x} y={y} width={w} height={h} listening={false}
      fillRadialGradientStartPoint={{ x: w/2, y: h/2 }} fillRadialGradientStartRadius={Math.min(w,h)*0.2}
      fillRadialGradientEndPoint={{ x: w/2, y: h/2 }} fillRadialGradientEndRadius={Math.max(w,h)*0.75}
      fillRadialGradientColorStops={[0, trans, 1, opaque]} />;
  }
  if (g.type === 'wash') return <Rect x={x} y={y} width={w} height={h} fill={opaque} listening={false} />;
  const angles = { bottom: 180, top: 0, right: 90, left: 270, diag: 135 };
  const angle = angles[g.type] ?? 180;
  const pts = gradientPoints(angle, w, h);
  return <Rect x={x} y={y} width={w} height={h} listening={false}
    fillLinearGradientStartPoint={pts.start} fillLinearGradientEndPoint={pts.end}
    fillLinearGradientColorStops={[0, trans, 0.35, trans, 1, opaque]} />;
}

const BLEND_FRAC = 0.22;

function BlendRect({ x, y, w, h }) {
  const bw = Math.min(w * BLEND_FRAC, 60);
  const bh = Math.min(h * BLEND_FRAC, 60);
  const C0 = 'rgba(0,0,0,0.42)', C1 = 'rgba(0,0,0,0)';
  return (
    <>
      <Rect x={x} y={y} width={w} height={bh} listening={false}
        fillLinearGradientStartPoint={{x:0,y:0}} fillLinearGradientEndPoint={{x:0,y:bh}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
      <Rect x={x} y={y+h-bh} width={w} height={bh} listening={false}
        fillLinearGradientStartPoint={{x:0,y:bh}} fillLinearGradientEndPoint={{x:0,y:0}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
      <Rect x={x} y={y} width={bw} height={h} listening={false}
        fillLinearGradientStartPoint={{x:0,y:0}} fillLinearGradientEndPoint={{x:bw,y:0}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
      <Rect x={x+w-bw} y={y} width={bw} height={h} listening={false}
        fillLinearGradientStartPoint={{x:bw,y:0}} fillLinearGradientEndPoint={{x:0,y:0}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
    </>
  );
}

function PreviewCell({ cell, geo, spreadW, spreadH, gap, blendEdges, bgColor }) {
  const { photos } = useBookStore();
  const photo = photos.find((p) => p.id === cell.photoId);
  const [img] = useImage(photo?.src);

  const x = geo.x * spreadW + gap / 2;
  const y = geo.y * spreadH + gap / 2;
  const w = geo.w * spreadW - gap;
  const h = geo.h * spreadH - gap;
  const rotation = cell.rotation || 0;

  const imgProps = (() => {
    if (!img) return null;
    const isSwapped = rotation === 90 || rotation === 270;
    const fitW = isSwapped ? img.height : img.width;
    const fitH = isSwapped ? img.width : img.height;
    const scale = Math.max(w / fitW, h / fitH) * cell.zoom;
    const iw = img.width * scale;
    const ih = img.height * scale;
    return { cx: x + w / 2 + cell.offsetX, cy: y + h / 2 + cell.offsetY, iw, ih };
  })();

  return (
    <Group clipX={x} clipY={y} clipWidth={w} clipHeight={h}>
      <Rect x={x} y={y} width={w} height={h} fill={bgColor || '#1a1a1a'} />
      {img && imgProps && (
        <KImage
          image={img}
          x={imgProps.cx} y={imgProps.cy}
          width={imgProps.iw} height={imgProps.ih}
          offsetX={imgProps.iw / 2} offsetY={imgProps.ih / 2}
          rotation={rotation}
        />
      )}
      {cell.gradient && <PreviewCellGrad g={cell.gradient} x={x} y={y} w={w} h={h} />}
      {blendEdges && img && <BlendRect x={x} y={y} w={w} h={h} />}
    </Group>
  );
}

function SpreadPreview({ spread, width }) {
  const { blendEdges, gap, spreadSizeId, customSize } = useBookStore();
  const { w: exportW, h: exportH } = getScreenDims(spreadSizeId, customSize);
  const height = Math.round(width * exportH / exportW);

  if (!spread) return null;

  return (
    <Stage width={width} height={height}>
      <Layer>
        <PreviewSpreadBg spread={spread} w={width} h={height} />
        {(spread.cellGeometry || []).map((geo, i) => (
          <PreviewCell
            key={i}
            cell={spread.cells[i] || { photoId: null, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 }}
            geo={geo}
            spreadW={width}
            spreadH={height}
            gap={gap}
            blendEdges={blendEdges}
            bgColor={spread.bgColor || '#1a1a1a'}
          />
        ))}
        {/* Spread-center indicator: small dots at the spine tips
            instead of a dashed line down the middle. */}
        <Circle x={width / 2} y={6}          radius={2} fill="#3a3a3a" listening={false} />
        <Circle x={width / 2} y={height - 6} radius={2} fill="#3a3a3a" listening={false} />
        {spread.captions.map((cap) => (
          <KText
            key={cap.id}
            x={cap.x * width} y={cap.y * height}
            width={cap.w * width}
            text={cap.text}
            fontSize={(cap.fontSize || 18) * (width / exportW) * (exportW / getScreenDims(spreadSizeId, customSize).w)}
            fontStyle={cap.bold ? 'bold' : 'normal'}
            fill={cap.color || '#ffffff'}
            align={cap.align || 'left'}
            shadowColor="rgba(0,0,0,0.8)" shadowBlur={4} shadowOffset={{ x: 0, y: 1 }}
            listening={false}
          />
        ))}
        {spread.role && (
          <KText x={8} y={8} text={spread.role === 'cover' ? 'COVER' : 'BACK'}
            fontSize={10} fontStyle="bold" letterSpacing={1.5}
            fill={spread.role === 'cover' ? '#f6c90e' : '#aaa'}
            listening={false}
          />
        )}
      </Layer>
    </Stage>
  );
}

// Mini thumbnail for the strip at the bottom
function MiniThumb({ spread, active, onClick, width, height }) {
  const { photos } = useBookStore();
  const geo = spread.cellGeometry || [];
  return (
    <div onClick={onClick} style={{
      cursor: 'pointer',
      border: active ? '2px solid #4f8ef7' : '2px solid transparent',
      borderRadius: 3,
      overflow: 'hidden',
      flexShrink: 0,
      opacity: active ? 1 : 0.5,
      transition: 'opacity 0.15s',
    }}>
      <svg width={width} height={height} style={{ display: 'block',
        background: spread.bgMode === 'gradient' && spread.bgGradient
          ? `linear-gradient(${spread.bgGradient.angle}deg, ${spread.bgGradient.stops[0]}, ${spread.bgGradient.stops[1]})`
          : spread.bgMode === 'image' && spread.bgImage
          ? `url(${spread.bgImage}) center/cover`
          : spread.bgColor || '#0d0d0d',
      }}>
        {geo.map((c, i) => {
          const cell = spread.cells[i];
          const filled = cell && photos.some((p) => p.id === cell.photoId);
          return (
            <rect key={i}
              x={c.x * width + 1} y={c.y * height + 1}
              width={c.w * width - 2} height={c.h * height - 2}
              fill={filled ? '#3a5580' : '#2a2a2a'} rx={1}
            />
          );
        })}
      </svg>
    </div>
  );
}

export default function PreviewMode({ onClose, mobile = false }) {
  const { spreads } = useBookStore();
  const [idx, setIdx] = useState(0);

  const previewW = Math.min(window.innerWidth * (mobile ? 0.94 : 0.86), 1100);

  // Touch swipe for mobile
  const touchStartXRef = useRef(null);
  const onTouchStart = (e) => { touchStartXRef.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartXRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0) setIdx((i) => Math.min(i + 1, spreads.length - 1));
      else setIdx((i) => Math.max(i - 1, 0));
    }
    touchStartXRef.current = null;
  };

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, spreads.length - 1));
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   setIdx((i) => Math.max(i - 1, 0));
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, spreads.length]);

  const spread = spreads[idx];

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.96)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={mobile ? onTouchStart : undefined}
      onTouchEnd={mobile ? onTouchEnd : undefined}
    >
      {/* Close + counter */}
      <div className={mobile ? 'safe-top' : ''} style={{ position: 'absolute', top: mobile ? 0 : 16, right: 16, left: mobile ? 16 : 'auto', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: mobile ? '12px 0 0' : 0, zIndex: 10 }}>
        <span style={{ fontSize: 12, color: '#888' }}>
          {idx + 1} / {spreads.length}
          {spread?.role ? ` · ${spread.role.toUpperCase()}` : ''}
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: '1px solid #333',
          borderRadius: 4, color: '#aaa', fontSize: 13, cursor: 'pointer', padding: '6px 12px',
          minHeight: mobile ? 38 : undefined,
        }}>
          ✕ Close
        </button>
      </div>

      {/* Main preview */}
      <div style={{ boxShadow: '0 12px 60px rgba(0,0,0,0.8)', borderRadius: 2, maxWidth: '100%' }}>
        <SpreadPreview spread={spread} width={previewW} />
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <button
          onClick={() => setIdx((i) => Math.max(i - 1, 0))}
          disabled={idx === 0}
          style={{
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4,
            color: idx === 0 ? '#333' : '#aaa', fontSize: 18, cursor: idx === 0 ? 'default' : 'pointer',
            padding: '4px 14px', lineHeight: 1,
          }}
        >
          ‹
        </button>

        {/* Thumbnail strip */}
        <div style={{ display: 'flex', gap: 6, maxWidth: '70vw', overflowX: 'auto', padding: '2px 0' }}>
          {spreads.map((sp, i) => (
            <MiniThumb
              key={sp.id}
              spread={sp}
              active={i === idx}
              onClick={() => setIdx(i)}
              width={80}
              height={40}
            />
          ))}
        </div>

        <button
          onClick={() => setIdx((i) => Math.min(i + 1, spreads.length - 1))}
          disabled={idx === spreads.length - 1}
          style={{
            background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4,
            color: idx === spreads.length - 1 ? '#333' : '#aaa', fontSize: 18,
            cursor: idx === spreads.length - 1 ? 'default' : 'pointer',
            padding: '4px 14px', lineHeight: 1,
          }}
        >
          ›
        </button>
      </div>

      <div style={{ fontSize: 11, color: '#333' }}>
        {mobile ? 'Swipe to navigate · Tap × to close' : '← → to navigate · ESC to close'}
      </div>
    </div>
  );
}
