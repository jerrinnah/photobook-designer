import { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Rect, Image as KImage, Group, Line, Text as KText } from 'react-konva';
import Konva from 'konva';
import { useBookStore } from '../store/useBookStore';
import { getScreenDims, getEffectiveExportSize } from '../layouts/spreadSizes';
import SeamHandles from './SeamHandles';
import useImage from '../hooks/useImage';
import { loadPhoto as loadPhotoFile } from '../utils/photoLoader';
import { useLocalStorage } from '../hooks/useLocalStorage';

// Convert gradient angle + two stops to Konva linearGradient start/end points
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
  return (
    <KImage image={img} x={(w - iw) / 2} y={(h - ih) / 2} width={iw} height={ih} listening={false} />
  );
}

const hexToRgba = (hex, alpha) => {
  if (!hex || hex.length < 7) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

function GradRect({ g, width, height }) {
  const type = g.type || 'linear';
  const stops = g.stops || ['#111', '#050505'];
  if (type === 'radial') {
    return (
      <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.75}
        fillRadialGradientColorStops={[0, stops[0], 1, stops[1]]} />
    );
  }
  if (type === 'vignette') {
    return (
      <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={Math.min(width, height) * 0.25}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.75}
        fillRadialGradientColorStops={[0, stops[1], 1, stops[0]]} />
    );
  }
  const pts = gradientPoints(g.angle || 180, width, height);
  return (
    <Rect x={0} y={0} width={width} height={height} listening={false}
      fillLinearGradientStartPoint={pts.start} fillLinearGradientEndPoint={pts.end}
      fillLinearGradientColorStops={[0, stops[0], 1, stops[1]]} />
  );
}

function OverlayRect({ ov, width, height }) {
  const transparent = hexToRgba(ov.color, 0);
  const opaque = hexToRgba(ov.color, ov.opacity);
  if (ov.type === 'vignette') {
    return (
      <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={Math.min(width, height) * 0.2}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.75}
        fillRadialGradientColorStops={[0, transparent, 1, opaque]} />
    );
  }
  if (ov.type === 'radial') {
    return (
      <Rect x={0} y={0} width={width} height={height} listening={false}
        fillRadialGradientStartPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientStartRadius={0}
        fillRadialGradientEndPoint={{ x: width / 2, y: height / 2 }}
        fillRadialGradientEndRadius={Math.max(width, height) * 0.7}
        fillRadialGradientColorStops={[0, opaque, 1, transparent]} />
    );
  }
  const pts = gradientPoints(ov.angle || 180, width, height);
  return (
    <Rect x={0} y={0} width={width} height={height} listening={false}
      fillLinearGradientStartPoint={pts.start} fillLinearGradientEndPoint={pts.end}
      fillLinearGradientColorStops={[0, transparent, 1, opaque]} />
  );
}

// Renders the correct background fill/gradient/image Konva nodes
function SpreadBackground({ spread, w, h }) {
  const { bgMode, bgColor, bgGradient, bgImage, bgOverlay } = spread;
  if (bgMode === 'gradient' && bgGradient) {
    return <GradRect g={bgGradient} width={w} height={h} />;
  }
  if (bgMode === 'image' && bgImage) {
    return (
      <>
        <SpreadBgImage src={bgImage} w={w} h={h} />
        {bgOverlay && <OverlayRect ov={bgOverlay} width={w} height={h} />}
      </>
    );
  }
  return <Rect x={0} y={0} width={w} height={h} fill={bgColor || '#111'} listening={false} />;
}

// Gradient overlay rendered inside a cell's clip group
function CellGradientOverlay({ g, x, y, w, h }) {
  if (!g) return null;
  const opaque = hexToRgba(g.color || '#000000', g.opacity ?? 0.65);
  const trans  = hexToRgba(g.color || '#000000', 0);

  if (g.type === 'vignette') {
    return (
      <Rect x={x} y={y} width={w} height={h} listening={false}
        fillRadialGradientStartPoint={{ x: w / 2, y: h / 2 }}
        fillRadialGradientStartRadius={Math.min(w, h) * 0.2}
        fillRadialGradientEndPoint={{ x: w / 2, y: h / 2 }}
        fillRadialGradientEndRadius={Math.max(w, h) * 0.75}
        fillRadialGradientColorStops={[0, trans, 1, opaque]} />
    );
  }
  if (g.type === 'wash') {
    return <Rect x={x} y={y} width={w} height={h} fill={opaque} listening={false} />;
  }
  // Linear presets mapped to angle
  const angles = { bottom: 180, top: 0, right: 90, left: 270, diag: 135 };
  const angle = angles[g.type] ?? 180;
  const pts = gradientPoints(angle, w, h);
  // Offset points to be absolute (relative to clip group origin at x,y)
  const sp = { x: pts.start.x, y: pts.start.y };
  const ep = { x: pts.end.x,   y: pts.end.y };
  return (
    <Rect x={x} y={y} width={w} height={h} listening={false}
      fillLinearGradientStartPoint={sp} fillLinearGradientEndPoint={ep}
      fillLinearGradientColorStops={[0, trans, 0.35, trans, 1, opaque]} />
  );
}

const PRINT_STANDARDS = [
  { label: '4×6', w: 4, h: 6 }, { label: '6×4', w: 6, h: 4 },
  { label: '5×7', w: 5, h: 7 }, { label: '7×5', w: 7, h: 5 },
  { label: '2.5×3.5', w: 2.5, h: 3.5 }, { label: '3.5×2.5', w: 3.5, h: 2.5 },
  { label: '8×10', w: 8, h: 10 }, { label: '10×8', w: 10, h: 8 },
  { label: '4×4', w: 4, h: 4 }, { label: '5×5', w: 5, h: 5 }, { label: '8×8', w: 8, h: 8 },
];

function getCellPrintInfo(geo, spreadSizeId, customSize) {
  const { exportW, exportH } = getEffectiveExportSize(spreadSizeId, customSize);
  const pxW = Math.round(geo.w * exportW);
  const pxH = Math.round(geo.h * exportH);
  const aspect = pxW / pxH;
  let nearest = PRINT_STANDARDS[0], nearestDiff = Infinity;
  for (const s of PRINT_STANDARDS) {
    const diff = Math.abs(s.w / s.h - aspect);
    if (diff < nearestDiff) { nearestDiff = diff; nearest = s; }
  }
  const isStandard = nearestDiff < 0.12;
  const inW = (pxW / 300).toFixed(1);
  const inH = (pxH / 300).toFixed(1);
  return { label: isStandard ? nearest.label : `${inW}×${inH}`, isStandard, pxW, pxH };
}

const BLEND_FRAC = 0.22;

function BlendOverlays({ x, y, w, h }) {
  const bw = Math.min(w * BLEND_FRAC, 70);
  const bh = Math.min(h * BLEND_FRAC, 70);
  const C0 = 'rgba(0,0,0,0.42)', C1 = 'rgba(0,0,0,0)';
  return (
    <>
      <Rect x={x}      y={y}      width={w}  height={bh} listening={false}
        fillLinearGradientStartPoint={{x:0,y:0}} fillLinearGradientEndPoint={{x:0,y:bh}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
      <Rect x={x}      y={y+h-bh} width={w}  height={bh} listening={false}
        fillLinearGradientStartPoint={{x:0,y:bh}} fillLinearGradientEndPoint={{x:0,y:0}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
      <Rect x={x}      y={y}      width={bw}  height={h} listening={false}
        fillLinearGradientStartPoint={{x:0,y:0}} fillLinearGradientEndPoint={{x:bw,y:0}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
      <Rect x={x+w-bw} y={y}      width={bw}  height={h} listening={false}
        fillLinearGradientStartPoint={{x:bw,y:0}} fillLinearGradientEndPoint={{x:0,y:0}}
        fillLinearGradientColorStops={[0,C0,1,C1]} />
    </>
  );
}

function PhotoCell({ cell, geo, spreadId, cellIndex, spreadW, spreadH, gap, blendEdges, bgColor, onPhotoDragStart, onPhotoDragEnd }) {
  const { photos, selectedCellIndex, setSelectedCell, adjustCell } = useBookStore();
  const photo = photos.find((p) => p.id === cell.photoId);
  const [img] = useImage(photo?.src);
  const kImgRef = useRef(null);
  const fx = cell.effects;

  // Cache/uncache whenever filters or image change — runs unconditionally
  // so hook order stays stable across renders even when geometry is invalid.
  useEffect(() => {
    const node = kImgRef.current;
    if (!node || !img) return;
    const filters = [];
    if (fx?.bw)               filters.push(Konva.Filters.Grayscale);
    if (fx?.sepia)            filters.push(Konva.Filters.Sepia);
    if ((fx?.blur ?? 0) > 0)  filters.push(Konva.Filters.Blur);
    if ((fx?.brightness ?? 0) !== 0) filters.push(Konva.Filters.Brighten);
    if ((fx?.contrast ?? 0) !== 0)   filters.push(Konva.Filters.Contrast);
    if (filters.length > 0) node.cache();
    else node.clearCache();
  }, [img, fx?.bw, fx?.sepia, fx?.blur, fx?.brightness, fx?.contrast]);

  const x = geo.x * spreadW + gap / 2;
  const y = geo.y * spreadH + gap / 2;
  const w = Math.max(1, geo.w * spreadW - gap);
  const h = Math.max(1, geo.h * spreadH - gap);
  const isSelected = selectedCellIndex === cellIndex;
  if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
  const rotation = cell.rotation || 0;

  // Build the same filter list for the KImage render
  const activeFilters = [];
  if (fx) {
    if (fx.bw)          activeFilters.push(Konva.Filters.Grayscale);
    if (fx.sepia)       activeFilters.push(Konva.Filters.Sepia);
    if (fx.blur > 0)    activeFilters.push(Konva.Filters.Blur);
    if (fx.brightness !== 0) activeFilters.push(Konva.Filters.Brighten);
    if (fx.contrast !== 0)   activeFilters.push(Konva.Filters.Contrast);
  }

  const imgProps = (() => {
    if (!img) return null;
    const isSwapped = rotation === 90 || rotation === 270;
    const fitW = isSwapped ? img.height : img.width;
    const fitH = isSwapped ? img.width : img.height;
    const scale = Math.max(w / fitW, h / fitH) * cell.zoom;
    const iw = img.width * scale;
    const ih = img.height * scale;
    const cx = x + w / 2 + cell.offsetX;
    const cy = y + h / 2 + cell.offsetY;
    return { cx, cy, iw, ih };
  })();

  return (
    <Group clipX={x} clipY={y} clipWidth={w} clipHeight={h} onClick={() => { setSelectedCell(cellIndex); }}>
      <Rect x={x} y={y} width={w} height={h} fill={bgColor || '#1a1a1a'} />

      {img && imgProps && (
        <KImage
          ref={kImgRef}
          image={img}
          x={imgProps.cx}
          y={imgProps.cy}
          width={imgProps.iw}
          height={imgProps.ih}
          offsetX={imgProps.iw / 2}
          offsetY={imgProps.ih / 2}
          rotation={rotation}
          draggable={!cell.locked}
          filters={activeFilters.length > 0 ? activeFilters : undefined}
          blurRadius={fx?.blur ?? 0}
          brightness={fx?.brightness ?? 0}
          contrast={fx?.contrast ?? 0}
          onDragStart={() => onPhotoDragStart?.(cellIndex)}
          onDragEnd={(e) => {
            onPhotoDragEnd?.();
            adjustCell(spreadId, cellIndex, {
              offsetX: cell.offsetX + (e.target.x() - imgProps.cx),
              offsetY: cell.offsetY + (e.target.y() - imgProps.cy),
            });
          }}
          /* Photo zoom is handled at the canvas wheel listener, which routes
             to the selected cell. Removed cell-local handler to prevent
             double-zoom when both fire. */
        />
      )}

      {!img && (
        <>
          <Rect x={x+w/2-16} y={y+h/2-16} width={32} height={32} fill="#222" cornerRadius={4} />
          <Rect x={x+w/2-2}  y={y+h/2-10} width={4}  height={20} fill="#333" />
          <Rect x={x+w/2-10} y={y+h/2-2}  width={20} height={4}  fill="#333" />
        </>
      )}

      {cell.gradient && <CellGradientOverlay g={cell.gradient} x={x} y={y} w={w} h={h} />}
      {fx?.vignette && !cell.gradient && (
        <CellGradientOverlay g={{ type: 'vignette', color: '#000000', opacity: 0.6 }} x={x} y={y} w={w} h={h} />
      )}
      {blendEdges && img && <BlendOverlays x={x} y={y} w={w} h={h} />}

      {/* Lock indicator */}
      {cell.locked && (
        <>
          <Rect x={x+5} y={y+5} width={20} height={20} fill="rgba(0,0,0,0.72)" cornerRadius={3} listening={false} />
          <KText x={x+5} y={y+6} width={20} height={20} text="🔒" fontSize={11} align="center" listening={false} />
        </>
      )}

      {/* Subtle cell border — always visible so empty cells are obvious on white spreads */}
      {!isSelected && (
        <Rect x={x} y={y} width={w} height={h}
          stroke="rgba(0,0,0,0.18)" strokeWidth={1} fill="transparent" listening={false} />
      )}

      {isSelected && (
        <Rect x={x} y={y} width={w} height={h}
          stroke="#4f8ef7" strokeWidth={2} fill="transparent" listening={false} />
      )}
    </Group>
  );
}

// Caption rendered as draggable Konva Text
function CaptionNode({ cap, spreadW, spreadH, isSelected, onSelect, onDblClick, onDragEnd }) {
  const fontStyle = [cap.italic ? 'italic' : '', cap.bold ? 'bold' : ''].filter(Boolean).join(' ') || 'normal';
  return (
    <KText
      x={cap.x * spreadW}
      y={cap.y * spreadH}
      width={cap.w * spreadW}
      text={cap.text}
      fontSize={cap.fontSize || 18}
      fontFamily={cap.fontFamily || 'system-ui, sans-serif'}
      fontStyle={fontStyle}
      letterSpacing={cap.letterSpacing ?? 0}
      lineHeight={cap.lineHeight ?? 1.2}
      fill={cap.color || '#ffffff'}
      align={cap.align || 'left'}
      draggable
      onClick={onSelect}
      onDblClick={onDblClick}
      onDragEnd={onDragEnd}
      shadowColor={cap.shadowColor || 'rgba(0,0,0,0.8)'}
      shadowBlur={isSelected ? 0 : (cap.shadow ?? 4)}
      shadowOffset={{ x: 0, y: 1 }}
      stroke={isSelected ? '#4f8ef7' : undefined}
      strokeWidth={isSelected ? 0.5 : 0}
    />
  );
}

const cellBtnStyle = (extra = {}) => ({
  padding: '5px 10px',
  background: 'transparent',
  border: '1px solid #2e2e2e',
  borderRadius: 4,
  color: '#aaa',
  fontSize: 11,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  lineHeight: 1,
  ...extra,
});

export default function SpreadCanvas({ stageRef, mobile = false }) {
  const {
    spreads, activeSpreadId, assignPhoto, addPhotos, addCellAt,
    spreadSizeId, customSize, blendEdges, gap,
    selectedCellIndex, setSelectedCell,
    splitCell, removeCell, rotateCellPhoto, toggleCellLock, clearCell,
    commitResizeCell, setCellGradient, transferCell, setCellEffects,
    addCaption, updateCaption, removeCaption,
    adjustCell,
  } = useBookStore();

  const cellFileInputRef = useRef(null);
  const pendingCellRef = useRef(null);
  const resizeDragRef = useRef(null);
  const ghostResizeRef = useRef(null);
  const moveDragRef = useRef(null);
  const [snapGuides, setSnapGuides] = useState({ v: [], h: [] });
  const [zoom, setZoom] = useLocalStorage('canvas-zoom', 1);
  const zoomContainerRef = useRef(null);
  const pinchRef = useRef(null);
  // Latest interaction state — lets the wheel/pinch listeners read fresh values
  // without being re-registered every render.
  const interactionStateRef = useRef({});

  // Clamp helper
  const setZoomClamped = (z) => setZoom(Math.max(0.25, Math.min(4, z)));

  // Center the scaled canvas in the scroll viewport whenever zoom changes
  // (and on mount). Without this, the spread can end up scrolled to a corner.
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;
    // Defer to next frame so layout has updated with the new zoom
    requestAnimationFrame(() => {
      const sx = (el.scrollWidth - el.clientWidth) / 2;
      const sy = (el.scrollHeight - el.clientHeight) / 2;
      el.scrollTo({ left: sx, top: sy, behavior: 'instant' });
    });
  }, [zoom, spreadSizeId]);

  // Wheel + pinch zoom — routes based on selection:
  //   • Cell selected with a photo → zoom THAT cell's photo
  //   • Cmd/Ctrl + wheel anywhere → zoom the whole canvas
  //   • Plain wheel with no selection → standard scroll (when zoomed in)
  useEffect(() => {
    const el = zoomContainerRef.current;
    if (!el) return;

    const onWheel = (e) => {
      const { selectedCellIndex: selIdx, spread: sp, activeSpreadId: spId } = interactionStateRef.current;
      const selectedCell = (selIdx !== null && selIdx !== undefined) ? sp?.cells[selIdx] : null;

      // Selected cell with a photo → zoom the photo inside the cell
      if (selectedCell?.photoId) {
        e.preventDefault();
        const currentZoom = selectedCell.zoom || 1;
        const next = Math.max(0.5, Math.min(5, currentZoom - e.deltaY * 0.0015));
        adjustCell(spId, selIdx, { zoom: next });
        return;
      }

      // Cmd/Ctrl + wheel → zoom the whole canvas
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.0015;
        setZoom((z) => Math.max(0.25, Math.min(4, z * (1 + delta))));
        return;
      }
      // Otherwise: let the browser scroll the canvas container normally
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const { selectedCellIndex: selIdx, spread: sp } = interactionStateRef.current;
        const cell = (selIdx !== null && selIdx !== undefined) ? sp?.cells[selIdx] : null;
        pinchRef.current = {
          dist: Math.hypot(dx, dy),
          canvasZoomStart: zoom,
          cellZoomStart: cell?.zoom || 1,
          targetCellIdx: cell?.photoId ? selIdx : null,
        };
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const ratio = Math.hypot(dx, dy) / pinchRef.current.dist;
        const { activeSpreadId: spId } = interactionStateRef.current;

        if (pinchRef.current.targetCellIdx !== null) {
          // Pinch on a selected photo → zoom only that photo
          const next = Math.max(0.5, Math.min(5, pinchRef.current.cellZoomStart * ratio));
          adjustCell(spId, pinchRef.current.targetCellIdx, { zoom: next });
        } else {
          // Otherwise → zoom the whole canvas
          setZoom(() => Math.max(0.25, Math.min(4, pinchRef.current.canvasZoomStart * ratio)));
        }
      }
    };
    const onTouchEnd = () => { pinchRef.current = null; };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [zoom, setZoom, adjustCell]);

  const handlePickPhotoForCell = (cellIndex) => {
    pendingCellRef.current = cellIndex;
    cellFileInputRef.current?.click();
  };

  const handleCellFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || pendingCellRef.current === null) return;
    const photo = await loadPhotoFile(file);
    addPhotos([photo]);
    assignPhoto(activeSpreadId, pendingCellRef.current, photo.id);
    pendingCellRef.current = null;
    e.target.value = '';
  };

  const spread = spreads.find((s) => s.id === activeSpreadId);
  const cellGeometry = spread?.cellGeometry || [];

  // Keep the wheel/pinch listeners' state ref fresh without re-registering them
  interactionStateRef.current = { selectedCellIndex, spread, activeSpreadId };

  const { w: SPREAD_W, h: SPREAD_H } = getScreenDims(spreadSizeId, customSize);
  const [dragOver, setDragOver] = useState(null);
  const [selectedCaptionId, setSelectedCaptionId] = useState(null);
  const [editingCaption, setEditingCaption] = useState(null);
  const [ghostCell, setGhostCell] = useState(null);
  const [ghostPreset, setGhostPreset] = useState('45');
  const [showGradPanel, setShowGradPanel] = useState(false);
  const [showFxPanel, setShowFxPanel] = useState(false);
  const [cropGuideCell, setCropGuideCell] = useState(null);

  // Delete / Backspace removes the selected caption or cell.
  // Ignored while typing in inputs/textareas/contenteditable so it doesn't
  // hijack text editing (book name, search, caption inline edit, etc.).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target;
      const tag = t?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;

      if (selectedCaptionId) {
        e.preventDefault();
        removeCaption(activeSpreadId, selectedCaptionId);
        setSelectedCaptionId(null);
        return;
      }
      if (selectedCellIndex !== null && selectedCellIndex !== undefined) {
        e.preventDefault();
        removeCell(activeSpreadId, selectedCellIndex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedCaptionId, selectedCellIndex, activeSpreadId, removeCaption, removeCell]);

  // Preset sizes (cw/ch for default 12×6 spread, i.e. spreadRatio=2)
  const PRESETS = {
    '916': { label: '9:16', hint: '916', cw: 0.197, ch: 0.7  },
    '45':  { label: '4:5',  hint: '45',  cw: 0.28,  ch: 0.7  },
    '169': { label: '16:9', hint: '169', cw: 0.4,   ch: 0.45 },
    'sq':  { label: '1:1',  hint: null,  cw: 0.25,  ch: 0.5  },
  };

  const ghostGeo = ghostCell ? (() => {
    const p = PRESETS[ghostPreset];
    return {
      x: Math.max(0, Math.min(1 - p.cw, ghostCell.nx - p.cw / 2)),
      y: Math.max(0, Math.min(1 - p.ch, ghostCell.ny - p.ch / 2)),
      w: p.cw, h: p.ch, hint: p.hint,
    };
  })() : null;

  if (!spread) return null;

  // ── Cell resize handles ──────────────────────────────────────────────
  const RH_SIZE = mobile ? 22 : 10; // bigger touch targets on mobile
  const RH_MIN = 0.04; // minimum cell dimension (normalised)

  const RH_DEFS = [
    { id: 'nw', xe: 'left',  ye: 'top'    },
    { id: 'n',  xe: 'mid',   ye: 'top'    },
    { id: 'ne', xe: 'right', ye: 'top'    },
    { id: 'e',  xe: 'right', ye: 'mid'    },
    { id: 'se', xe: 'right', ye: 'bottom' },
    { id: 's',  xe: 'mid',   ye: 'bottom' },
    { id: 'sw', xe: 'left',  ye: 'bottom' },
    { id: 'w',  xe: 'left',  ye: 'mid'    },
  ];

  const rhCursors = { nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', e: 'e-resize', se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize' };

  const getHandlePx = (geo, xe, ye) => ({
    x: (xe === 'left' ? geo.x : xe === 'right' ? geo.x + geo.w : geo.x + geo.w / 2) * SPREAD_W,
    y: (ye === 'top'  ? geo.y : ye === 'bottom' ? geo.y + geo.h : geo.y + geo.h / 2) * SPREAD_H,
  });

  const applyResize = (g0, xe, ye, dxPx, dyPx) => {
    const dx = dxPx / SPREAD_W;
    const dy = dyPx / SPREAD_H;
    const MIN = RH_MIN;
    let x = g0.x, y = g0.y, w = g0.w, h = g0.h;
    if (xe === 'left')   { const nw = Math.max(MIN, w - dx); x = g0.x + (w - nw); w = nw; }
    if (xe === 'right')  { w = Math.max(MIN, w + dx); }
    if (ye === 'top')    { const nh = Math.max(MIN, h - dy); y = g0.y + (h - nh); h = nh; }
    if (ye === 'bottom') { h = Math.max(MIN, h + dy); }
    x = Math.max(0, Math.min(1 - MIN, x));
    y = Math.max(0, Math.min(1 - MIN, y));
    w = Math.max(MIN, Math.min(1 - x, w));
    h = Math.max(MIN, Math.min(1 - y, h));
    return { x, y, w, h, hint: g0.hint };
  };

  // ── Snap helpers ─────────────────────────────────────────────────────
  // 6px screen-space tolerance. Snap targets: spread bounds, spine, and the
  // edges + centers of every OTHER cell on this spread.
  const SNAP_PX = 6;
  const otherCellTargets = (selfIndex) => {
    const xs = new Set([0, 0.5, 1]);
    const ys = new Set([0, 0.5, 1]);
    cellGeometry.forEach((c, i) => {
      if (i === selfIndex) return;
      xs.add(c.x); xs.add(c.x + c.w); xs.add(c.x + c.w / 2);
      ys.add(c.y); ys.add(c.y + c.h); ys.add(c.y + c.h / 2);
    });
    return { xs: [...xs], ys: [...ys] };
  };

  const snapMove = (nx, ny, w, h, selfIndex) => {
    const { xs, ys } = otherCellTargets(selfIndex);
    const tx = SNAP_PX / SPREAD_W;
    const ty = SNAP_PX / SPREAD_H;
    const edgesX = [nx, nx + w / 2, nx + w];
    const edgesY = [ny, ny + h / 2, ny + h];
    let bestDX = null, bestVTarget = null;
    edgesX.forEach((e) => xs.forEach((t) => {
      const d = t - e;
      if (Math.abs(d) < tx && (bestDX === null || Math.abs(d) < Math.abs(bestDX))) {
        bestDX = d; bestVTarget = t;
      }
    }));
    let bestDY = null, bestHTarget = null;
    edgesY.forEach((e) => ys.forEach((t) => {
      const d = t - e;
      if (Math.abs(d) < ty && (bestDY === null || Math.abs(d) < Math.abs(bestDY))) {
        bestDY = d; bestHTarget = t;
      }
    }));
    return {
      x: nx + (bestDX ?? 0),
      y: ny + (bestDY ?? 0),
      vGuide: bestVTarget !== null ? bestVTarget * SPREAD_W : null,
      hGuide: bestHTarget !== null ? bestHTarget * SPREAD_H : null,
    };
  };

  const snapResize = (g, xe, ye, selfIndex) => {
    const { xs, ys } = otherCellTargets(selfIndex);
    const tx = SNAP_PX / SPREAD_W;
    const ty = SNAP_PX / SPREAD_H;
    // Snap only the edges being dragged
    let vGuide = null, hGuide = null;
    let x = g.x, y = g.y, w = g.w, h = g.h;
    if (xe === 'left') {
      let best = null;
      xs.forEach((t) => { const d = t - x; if (Math.abs(d) < tx && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, t }; });
      if (best) { w = w - best.d; x = best.t; vGuide = best.t * SPREAD_W; }
    } else if (xe === 'right') {
      const right = x + w;
      let best = null;
      xs.forEach((t) => { const d = t - right; if (Math.abs(d) < tx && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, t }; });
      if (best) { w = w + best.d; vGuide = best.t * SPREAD_W; }
    }
    if (ye === 'top') {
      let best = null;
      ys.forEach((t) => { const d = t - y; if (Math.abs(d) < ty && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, t }; });
      if (best) { h = h - best.d; y = best.t; hGuide = best.t * SPREAD_H; }
    } else if (ye === 'bottom') {
      const bottom = y + h;
      let best = null;
      ys.forEach((t) => { const d = t - bottom; if (Math.abs(d) < ty && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d, t }; });
      if (best) { h = h + best.d; hGuide = best.t * SPREAD_H; }
    }
    return { geo: { ...g, x, y, w, h }, vGuide, hGuide };
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const photoId = e.dataTransfer.getData('photoId');
    if (!photoId) return;
    const box = e.currentTarget.getBoundingClientRect();
    const rx = (e.clientX - box.left) / box.width;
    const ry = (e.clientY - box.top) / box.height;
    const hit = cellGeometry.findIndex((c) => rx >= c.x && rx <= c.x + c.w && ry >= c.y && ry <= c.y + c.h);
    if (hit !== -1) assignPhoto(activeSpreadId, hit, photoId);
    setDragOver(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    const box = e.currentTarget.getBoundingClientRect();
    const rx = (e.clientX - box.left) / box.width;
    const ry = (e.clientY - box.top) / box.height;
    const hit = cellGeometry.findIndex((c) => rx >= c.x && rx <= c.x + c.w && ry >= c.y && ry <= c.y + c.h);
    setDragOver(hit !== -1 ? hit : null);
  };

  const handleStageClick = (e) => {
    if (e.target === e.target.getStage()) {
      const pos = e.target.getStage().getPointerPosition();
      const nx = pos.x / SPREAD_W;
      const ny = pos.y / SPREAD_H;
        // Only open ghost if click is not inside any existing cell
      const hitCell = cellGeometry.some(
        (c) => nx >= c.x && nx <= c.x + c.w && ny >= c.y && ny <= c.y + c.h
      );
      if (!hitCell) {
        setGhostCell({ nx, ny });
      } else {
        setGhostCell(null);
      }
      setSelectedCell(null);
      setSelectedCaptionId(null);
    }
  };

  const handleAddCaption = () => {
    addCaption(activeSpreadId, {
      text: 'Double-click to edit',
      x: 0.1,
      y: 0.82,
      w: 0.8,
      fontSize: 18,
      color: '#ffffff',
      bold: false,
      align: 'left',
    });
  };

  // Floating toolbar position for selected cell
  const selGeo = selectedCellIndex !== null ? cellGeometry[selectedCellIndex] : null;
  const floatToolbar = selGeo ? (() => {
    const cx = (selGeo.x + selGeo.w / 2) * SPREAD_W;
    const cy = selGeo.y * SPREAD_H;
    const bh = selGeo.h * SPREAD_H;
    const showAbove = (cy + bh) > SPREAD_H * 0.78;
    return { cx, top: showAbove ? cy - 38 : cy + bh + 6 };
  })() : null;

  // Floating toolbar position for selected caption
  const selCap = selectedCaptionId ? spread.captions.find((c) => c.id === selectedCaptionId) : null;
  const capToolbar = selCap ? {
    cx: (selCap.x + selCap.w / 2) * SPREAD_W,
    top: selCap.y * SPREAD_H - 42,
  } : null;

  const selectedCell = selectedCellIndex !== null ? spread.cells[selectedCellIndex] : null;

  // Padding around the canvas (breathing room). Wrapper always ≥ viewport
  // so flex centering works without overflow-clipping artefacts, and grows
  // when the scaled canvas exceeds the viewport so scrollbars work cleanly.
  const PAD = 24;
  const wrapperW = SPREAD_W * zoom + PAD * 2;
  const wrapperH = SPREAD_H * zoom + PAD * 2;

  return (
    <div style={{ flex: 1, position: 'relative', display: 'flex', minHeight: 0, minWidth: 0 }}>
      <div
        ref={zoomContainerRef}
        style={{
          flex: 1, overflow: 'auto',
          minHeight: 0, minWidth: 0,
        }}
      >
      {/* Wrapper grows when zoom > 1, but stays at least viewport size so the
          flex centering keeps the canvas centered without clipping. */}
      <div style={{
        minWidth: '100%',
        minHeight: '100%',
        width: wrapperW,
        height: wrapperH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(null)}
        style={{
          position: 'relative',
          width: SPREAD_W, height: SPREAD_H,
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          boxShadow: '0 8px 48px rgba(0,0,0,0.7)',
          flexShrink: 0,
        }}
      >
        <Stage
          width={SPREAD_W} height={SPREAD_H} ref={stageRef}
          onClick={handleStageClick}
        >
          <Layer>
            <SpreadBackground spread={spread} w={SPREAD_W} h={SPREAD_H} />

            {cellGeometry.map((geo, i) => (
              <PhotoCell
                key={i}
                cell={spread.cells[i] || { photoId: null, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, locked: false }}
                geo={geo}
                spreadId={activeSpreadId}
                cellIndex={i}
                spreadW={SPREAD_W}
                spreadH={SPREAD_H}
                gap={gap}
                blendEdges={blendEdges}
                bgColor={spread.bgColor || '#1a1a1a'}
                onPhotoDragStart={(ci) => setCropGuideCell(ci)}
                onPhotoDragEnd={() => setCropGuideCell(null)}
              />
            ))}

            <Line
              points={[SPREAD_W / 2, 0, SPREAD_W / 2, SPREAD_H]}
              stroke="#252525" strokeWidth={1} dash={[5, 5]} listening={false}
            />

            {dragOver !== null && cellGeometry[dragOver] && (() => {
              const c = cellGeometry[dragOver];
              return (
                <Rect
                  x={c.x * SPREAD_W + gap/2} y={c.y * SPREAD_H + gap/2}
                  width={c.w * SPREAD_W - gap} height={c.h * SPREAD_H - gap}
                  fill="rgba(79,142,247,0.15)" stroke="#4f8ef7" strokeWidth={2}
                  listening={false}
                />
              );
            })()}

            {/* Rule-of-thirds crop guide — shown while dragging a photo inside a cell */}
            {cropGuideCell !== null && cellGeometry[cropGuideCell] && (() => {
              const cg = cellGeometry[cropGuideCell];
              const gx = cg.x * SPREAD_W + gap / 2;
              const gy = cg.y * SPREAD_H + gap / 2;
              const gw = cg.w * SPREAD_W - gap;
              const gh = cg.h * SPREAD_H - gap;
              const lc = 'rgba(255,255,255,0.35)';
              return (
                <>
                  <Rect x={gx} y={gy} width={gw} height={gh} fill="transparent" stroke="rgba(255,255,255,0.2)" strokeWidth={1} listening={false} />
                  <Line points={[gx + gw/3, gy, gx + gw/3, gy + gh]} stroke={lc} strokeWidth={0.8} listening={false} />
                  <Line points={[gx + gw*2/3, gy, gx + gw*2/3, gy + gh]} stroke={lc} strokeWidth={0.8} listening={false} />
                  <Line points={[gx, gy + gh/3, gx + gw, gy + gh/3]} stroke={lc} strokeWidth={0.8} listening={false} />
                  <Line points={[gx, gy + gh*2/3, gx + gw, gy + gh*2/3]} stroke={lc} strokeWidth={0.8} listening={false} />
                  <Rect x={gx + gw/3 - 2} y={gy + gh/3 - 2} width={4} height={4} fill="rgba(255,255,255,0.5)" listening={false} />
                  <Rect x={gx + gw*2/3 - 2} y={gy + gh/3 - 2} width={4} height={4} fill="rgba(255,255,255,0.5)" listening={false} />
                  <Rect x={gx + gw/3 - 2} y={gy + gh*2/3 - 2} width={4} height={4} fill="rgba(255,255,255,0.5)" listening={false} />
                  <Rect x={gx + gw*2/3 - 2} y={gy + gh*2/3 - 2} width={4} height={4} fill="rgba(255,255,255,0.5)" listening={false} />
                </>
              );
            })()}

            {/* Captions layer */}
            {spread.captions.map((cap) => (
              <CaptionNode
                key={cap.id}
                cap={cap}
                spreadW={SPREAD_W}
                spreadH={SPREAD_H}
                isSelected={selectedCaptionId === cap.id}
                onSelect={() => { setSelectedCaptionId(cap.id); setSelectedCell(null); setGhostCell(null); }}
                onDblClick={() => setEditingCaption({ ...cap })}
                onDragEnd={(e) => {
                  updateCaption(activeSpreadId, cap.id, {
                    x: e.target.x() / SPREAD_W,
                    y: e.target.y() / SPREAD_H,
                  });
                }}
              />
            ))}

            {/* Spread role badge */}
            {spread.role && (
              <KText
                x={8} y={8} text={spread.role === 'cover' ? 'COVER' : 'BACK'}
                fontSize={10} fontStyle="bold" letterSpacing={1.5}
                fill={spread.role === 'cover' ? '#f6c90e' : '#aaa'}
                listening={false}
              />
            )}

            {/* Ghost cell preview */}
            {ghostGeo && (
              <Rect
                x={ghostGeo.x * SPREAD_W + gap / 2}
                y={ghostGeo.y * SPREAD_H + gap / 2}
                width={ghostGeo.w * SPREAD_W - gap}
                height={ghostGeo.h * SPREAD_H - gap}
                fill="rgba(79,142,247,0.08)"
                stroke="#4f8ef7"
                strokeWidth={1.5}
                dash={[6, 4]}
                listening={false}
              />
            )}

            <SeamHandles
              spreadId={activeSpreadId}
              cells={cellGeometry}
              spreadW={SPREAD_W}
              spreadH={SPREAD_H}
            />

            {/* Cell resize handles — shown when a cell is selected */}
            {selectedCellIndex !== null && cellGeometry[selectedCellIndex] && (() => {
              const rGeo = cellGeometry[selectedCellIndex];
              return (
                <>
                  {/* Dashed outline updated imperatively during drag */}
                  <Rect
                    ref={ghostResizeRef}
                    x={rGeo.x * SPREAD_W} y={rGeo.y * SPREAD_H}
                    width={rGeo.w * SPREAD_W} height={rGeo.h * SPREAD_H}
                    fill="transparent" stroke="#4f8ef7" strokeWidth={1}
                    dash={[4, 3]} listening={false}
                  />

                  {/* Snap guides */}
                  {snapGuides.v.map((x, i) => (
                    <Line key={`v${i}`} points={[x, 0, x, SPREAD_H]} stroke="#ff2d8a" strokeWidth={1} dash={[3, 2]} listening={false} />
                  ))}
                  {snapGuides.h.map((y, i) => (
                    <Line key={`h${i}`} points={[0, y, SPREAD_W, y]} stroke="#ff2d8a" strokeWidth={1} dash={[3, 2]} listening={false} />
                  ))}

                  {/* Move handle — yellow grip at top-center */}
                  {(() => {
                    const MH = 16;
                    const hx = (rGeo.x + rGeo.w / 2) * SPREAD_W - MH / 2;
                    const hy = rGeo.y * SPREAD_H - MH / 2;
                    return (
                      <Rect
                        x={hx} y={hy} width={MH} height={MH}
                        fill="#f6c90e" stroke="#fff" strokeWidth={1.5} cornerRadius={3}
                        draggable
                        onMouseEnter={() => { document.body.style.cursor = 'move'; }}
                        onMouseLeave={() => { document.body.style.cursor = 'default'; }}
                        onDragStart={(e) => {
                          // eslint-disable-next-line react-hooks/refs -- fires on drag, not render
                          moveDragRef.current = { startX: e.target.x(), startY: e.target.y(), geo: { ...rGeo } };
                        }}
                        onDragMove={(e) => {
                          if (!moveDragRef.current || !ghostResizeRef.current) return;
                          const { startX, startY, geo: g0 } = moveDragRef.current;
                          const dx = (e.target.x() - startX) / SPREAD_W;
                          const dy = (e.target.y() - startY) / SPREAD_H;
                          let nx = Math.max(0, Math.min(1 - g0.w, g0.x + dx));
                          let ny = Math.max(0, Math.min(1 - g0.h, g0.y + dy));
                          const snap = snapMove(nx, ny, g0.w, g0.h, selectedCellIndex);
                          nx = Math.max(0, Math.min(1 - g0.w, snap.x));
                          ny = Math.max(0, Math.min(1 - g0.h, snap.y));
                          setSnapGuides({
                            v: snap.vGuide !== null ? [snap.vGuide] : [],
                            h: snap.hGuide !== null ? [snap.hGuide] : [],
                          });
                          ghostResizeRef.current.setAttrs({ x: nx * SPREAD_W, y: ny * SPREAD_H, width: g0.w * SPREAD_W, height: g0.h * SPREAD_H });
                          ghostResizeRef.current.getLayer().batchDraw();
                        }}
                        onDragEnd={(e) => {
                          if (!moveDragRef.current) return;
                          const { startX, startY, geo: g0 } = moveDragRef.current;
                          const dx = (e.target.x() - startX) / SPREAD_W;
                          const dy = (e.target.y() - startY) / SPREAD_H;
                          let nx = Math.max(0, Math.min(1 - g0.w, g0.x + dx));
                          let ny = Math.max(0, Math.min(1 - g0.h, g0.y + dy));
                          const snap = snapMove(nx, ny, g0.w, g0.h, selectedCellIndex);
                          nx = Math.max(0, Math.min(1 - g0.w, snap.x));
                          ny = Math.max(0, Math.min(1 - g0.h, snap.y));
                          commitResizeCell(activeSpreadId, selectedCellIndex, { ...g0, x: nx, y: ny });
                          moveDragRef.current = null;
                          setSnapGuides({ v: [], h: [] });
                        }}
                      />
                    );
                  })()}

                  {RH_DEFS.map(({ id, xe, ye }) => {
                    const hp = getHandlePx(rGeo, xe, ye);
                    return (
                      <Rect
                        key={id}
                        x={hp.x - RH_SIZE / 2} y={hp.y - RH_SIZE / 2}
                        width={RH_SIZE} height={RH_SIZE}
                        fill="#4f8ef7" stroke="#fff" strokeWidth={1.5}
                        cornerRadius={2}
                        draggable
                        dragBoundFunc={(pos) => ({
                          x: xe === 'mid' ? hp.x - RH_SIZE / 2 : Math.max(-RH_SIZE / 2, Math.min(SPREAD_W - RH_SIZE / 2, pos.x)),
                          y: ye === 'mid' ? hp.y - RH_SIZE / 2 : Math.max(-RH_SIZE / 2, Math.min(SPREAD_H - RH_SIZE / 2, pos.y)),
                        })}
                        onMouseEnter={(e) => { document.body.style.cursor = rhCursors[id]; e.target.fill('#6aa8ff'); e.target.getLayer().batchDraw(); }}
                        onMouseLeave={(e) => { document.body.style.cursor = 'default'; e.target.fill('#4f8ef7'); e.target.getLayer().batchDraw(); }}
                        onDragStart={(e) => {
                          // eslint-disable-next-line react-hooks/refs -- fires on drag, not render
                          resizeDragRef.current = { startX: e.target.x(), startY: e.target.y(), geo: { ...rGeo }, xe, ye };
                        }}
                        onDragMove={(e) => {
                          if (!resizeDragRef.current || !ghostResizeRef.current) return;
                          const { startX, startY, geo: g0, xe: ex, ye: ey } = resizeDragRef.current;
                          const raw = applyResize(g0, ex, ey, e.target.x() - startX, e.target.y() - startY);
                          const snap = snapResize(raw, ex, ey, selectedCellIndex);
                          setSnapGuides({
                            v: snap.vGuide !== null ? [snap.vGuide] : [],
                            h: snap.hGuide !== null ? [snap.hGuide] : [],
                          });
                          ghostResizeRef.current.setAttrs({ x: snap.geo.x * SPREAD_W, y: snap.geo.y * SPREAD_H, width: snap.geo.w * SPREAD_W, height: snap.geo.h * SPREAD_H });
                          ghostResizeRef.current.getLayer().batchDraw();
                        }}
                        onDragEnd={(e) => {
                          if (!resizeDragRef.current) return;
                          const { startX, startY, geo: g0, xe: ex, ye: ey } = resizeDragRef.current;
                          const raw = applyResize(g0, ex, ey, e.target.x() - startX, e.target.y() - startY);
                          const snap = snapResize(raw, ex, ey, selectedCellIndex);
                          commitResizeCell(activeSpreadId, selectedCellIndex, snap.geo);
                          resizeDragRef.current = null;
                          setSnapGuides({ v: [], h: [] });
                        }}
                      />
                    );
                  })}
                </>
              );
            })()}
          </Layer>
        </Stage>

        {/* Floating cell action toolbar */}
        {floatToolbar && selectedCell && (() => {
          const printInfo = selGeo ? getCellPrintInfo(selGeo, spreadSizeId, customSize) : null;
          return (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: floatToolbar.cx,
                top: floatToolbar.top,
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                padding: '4px 5px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                zIndex: 20,
                pointerEvents: 'all',
              }}
            >
              {/* Cell label + print size */}
              <span style={{ fontSize: 10, color: '#444', padding: '0 4px', borderRight: '1px solid #222', marginRight: 2, whiteSpace: 'nowrap' }}>
                Cell {selectedCellIndex + 1}
              </span>
              {printInfo && (
                <span
                  title={`${printInfo.pxW}×${printInfo.pxH}px at export resolution`}
                  style={{
                    fontSize: 9,
                    color: printInfo.isStandard ? '#6fcf97' : '#555',
                    padding: '0 5px 0 0',
                    borderRight: '1px solid #222',
                    marginRight: 2,
                    whiteSpace: 'nowrap',
                    cursor: 'default',
                  }}
                >
                  {printInfo.label}in
                </span>
              )}

              <button
                style={cellBtnStyle({ color: '#4f8ef7', borderColor: '#1e3a5f', background: '#0e1620' })}
                title="Pick a photo from your computer and place it in this cell"
                onClick={() => handlePickPhotoForCell(selectedCellIndex)}
              >
                + Photo
              </button>

              <div style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 2px' }} />

              <button style={cellBtnStyle()} title="Split into left + right"
                onClick={() => splitCell(activeSpreadId, selectedCellIndex, 'v')}>
                <span style={{ letterSpacing: -1 }}>⬚</span> Split |
              </button>

              <button style={cellBtnStyle()} title="Split into top + bottom"
                onClick={() => splitCell(activeSpreadId, selectedCellIndex, 'h')}>
                <span style={{ letterSpacing: -1 }}>⬚</span> Split —
              </button>

              <div style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 2px' }} />

              {selectedCell.photoId && (
                <>
                  <button style={cellBtnStyle({ color: '#9ad' })} title="Rotate photo 90°"
                    onClick={() => rotateCellPhoto(activeSpreadId, selectedCellIndex)}>
                    ↻ Rotate
                  </button>
                  <button style={cellBtnStyle({ color: '#e05c5c' })} title="Remove photo from cell"
                    onClick={() => clearCell(activeSpreadId, selectedCellIndex)}>
                    ✕ Clear
                  </button>
                </>
              )}

              <button
                style={cellBtnStyle({ color: selectedCell.locked ? '#f6c90e' : '#666' })}
                title={selectedCell.locked ? 'Unlock cell' : 'Lock cell (skipped by Auto Design)'}
                onClick={() => toggleCellLock(activeSpreadId, selectedCellIndex)}
              >
                {selectedCell.locked ? '🔓 Unlock' : '🔒 Lock'}
              </button>

              <div style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 2px' }} />

              <button
                style={cellBtnStyle({ color: '#e05c5c', borderColor: 'transparent' })}
                title="Remove this cell from the layout"
                onClick={() => removeCell(activeSpreadId, selectedCellIndex)}
              >
                ✕ Remove Cell
              </button>

              {spreads.length > 1 && spreads[spreads.length - 1]?.id !== activeSpreadId && (
                <button
                  style={cellBtnStyle({ color: '#f6c90e', borderColor: '#3a3000', background: '#1a1500' })}
                  title="Move this cell (with its photo) to the last spread"
                  onClick={() => transferCell(activeSpreadId, selectedCellIndex)}
                >
                  → Last
                </button>
              )}

              <div style={{ width: 1, height: 16, background: '#2a2a2a', margin: '0 2px' }} />

              <button
                style={cellBtnStyle({
                  color: (selectedCell.gradient && showGradPanel) ? '#b89fff' : selectedCell.gradient ? '#9a7fdf' : '#555',
                  background: showGradPanel ? '#1a1230' : 'transparent',
                  border: showGradPanel ? '1px solid #352260' : '1px solid transparent',
                })}
                title="Cell gradient overlay"
                onClick={() => { setShowGradPanel((v) => !v); setShowFxPanel(false); }}
              >
                ◧ Grad
              </button>

              <button
                style={cellBtnStyle({
                  color: (selectedCell.effects && showFxPanel) ? '#6fcf97' : selectedCell.effects ? '#4aa87a' : '#555',
                  background: showFxPanel ? '#0d1f14' : 'transparent',
                  border: showFxPanel ? '1px solid #1a4a2a' : '1px solid transparent',
                })}
                title="Photo effects (B&W, sepia, blur, brightness)"
                onClick={() => { setShowFxPanel((v) => !v); setShowGradPanel(false); }}
              >
                ✦ FX
              </button>
            </div>
          );
        })()}

        {/* Cell gradient panel */}
        {floatToolbar && selectedCell && showGradPanel && (() => {
          const cg = selectedCell.gradient;
          const GRAD_TYPES = [
            { id: null,      label: 'None' },
            { id: 'bottom',  label: '↓' },
            { id: 'top',     label: '↑' },
            { id: 'left',    label: '←' },
            { id: 'right',   label: '→' },
            { id: 'diag',    label: '↘' },
            { id: 'vignette',label: '◎' },
            { id: 'wash',    label: '▣' },
          ];
          const setGrad = (patch) => {
            if (patch === null) { setCellGradient(activeSpreadId, selectedCellIndex, null); return; }
            const base = cg || { type: 'bottom', color: '#000000', opacity: 0.65 };
            setCellGradient(activeSpreadId, selectedCellIndex, { ...base, ...patch });
          };
          return (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: floatToolbar.cx,
                top: floatToolbar.top + (floatToolbar.top < SPREAD_H / 2 ? 36 : -116),
                transform: 'translateX(-50%)',
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                padding: '8px 10px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
                zIndex: 21,
                minWidth: 220,
              }}
            >
              <div style={{ fontSize: 9, color: '#444', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                Gradient Overlay
              </div>
              {/* Type buttons */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                {GRAD_TYPES.map(({ id, label }) => {
                  const active = id === null ? !cg : cg?.type === id;
                  return (
                    <button key={String(id)} onClick={() => id === null ? setGrad(null) : setGrad({ type: id })}
                      style={{
                        padding: '4px 8px', fontSize: id === null ? 10 : 13, borderRadius: 3, cursor: 'pointer',
                        background: active ? '#1e2535' : '#181818',
                        color: active ? '#4f8ef7' : '#666',
                        border: `1px solid ${active ? '#4f8ef7' : '#252525'}`,
                        minWidth: id === null ? 40 : 30,
                      }}>
                      {label}
                    </button>
                  );
                })}
              </div>

              {cg && (
                <>
                  {/* Colour + opacity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={cg.color || '#000000'}
                      onChange={(e) => setGrad({ color: e.target.value })}
                      style={{ width: 28, height: 22, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }} />
                    <span style={{ fontSize: 9, color: '#444' }}>Opacity</span>
                    <input type="range" min={0.05} max={1} step={0.05} value={cg.opacity ?? 0.65}
                      onChange={(e) => setGrad({ opacity: parseFloat(e.target.value) })}
                      style={{ flex: 1, accentColor: '#4f8ef7' }} />
                    <span style={{ fontSize: 9, color: '#555', minWidth: 26, textAlign: 'right' }}>
                      {Math.round((cg.opacity ?? 0.65) * 100)}%
                    </span>
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Cell FX panel */}
        {floatToolbar && selectedCell && showFxPanel && (() => {
          const fx = selectedCell.effects || { bw: false, sepia: false, blur: 0, brightness: 0, contrast: 0, vignette: false };
          const setFx = (patch) => setCellEffects(activeSpreadId, selectedCellIndex, { ...fx, ...patch });
          const clearFx = () => setCellEffects(activeSpreadId, selectedCellIndex, null);
          const hasAny = selectedCell.effects && (fx.bw || fx.sepia || fx.blur > 0 || fx.brightness !== 0 || fx.contrast !== 0 || fx.vignette);
          const togBtn = (active) => ({
            padding: '4px 9px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
            background: active ? '#162516' : '#181818',
            color: active ? '#6fcf97' : '#555',
            border: `1px solid ${active ? '#2a4a2a' : '#252525'}`,
          });
          return (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: floatToolbar.cx,
                top: floatToolbar.top + (floatToolbar.top < SPREAD_H / 2 ? 36 : -190),
                transform: 'translateX(-50%)',
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                padding: '10px 12px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
                zIndex: 21,
                minWidth: 240,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 9, color: '#444', letterSpacing: 0.5, textTransform: 'uppercase' }}>Photo Effects</span>
                {hasAny && (
                  <button onClick={clearFx} style={{ fontSize: 9, background: 'none', border: 'none', color: '#e05c5c', cursor: 'pointer', padding: 0 }}>
                    Clear All
                  </button>
                )}
              </div>

              {/* Toggle effects */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
                <button style={togBtn(fx.bw)} onClick={() => setFx({ bw: !fx.bw, sepia: false })}>B&W</button>
                <button style={togBtn(fx.sepia)} onClick={() => setFx({ sepia: !fx.sepia, bw: false })}>Sepia</button>
                <button style={togBtn(fx.vignette)} onClick={() => setFx({ vignette: !fx.vignette })}>Vignette</button>
              </div>

              {/* Sliders */}
              {[
                { label: 'Blur',       key: 'blur',       min: 0,    max: 20,  step: 0.5, fmt: (v) => `${v}px` },
                { label: 'Brightness', key: 'brightness', min: -1,   max: 1,   step: 0.05, fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%` },
                { label: 'Contrast',   key: 'contrast',   min: -100, max: 100, step: 5,   fmt: (v) => `${v > 0 ? '+' : ''}${v}` },
              ].map(({ label, key, min, max, step, fmt }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: '#555', minWidth: 58 }}>{label}</span>
                  <input type="range" min={min} max={max} step={step} value={fx[key] ?? (key === 'blur' ? 0 : 0)}
                    onChange={(e) => setFx({ [key]: parseFloat(e.target.value) })}
                    style={{ flex: 1, accentColor: '#6fcf97' }} />
                  <span style={{ fontSize: 9, color: '#444', minWidth: 32, textAlign: 'right' }}>
                    {fmt(fx[key] ?? 0)}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Vignette effect via gradient overlay — applied in CellGradientOverlay when fx.vignette is true */}

        {/* Floating caption toolbar — two-row layout */}
        {capToolbar && selCap && (() => {
          const upd = (patch) => updateCaption(activeSpreadId, selCap.id, patch);
          const FONTS = [
            { label: 'Sans', value: 'system-ui, sans-serif' },
            { label: 'Serif', value: 'Georgia, serif' },
            { label: 'Mono', value: '"Courier New", monospace' },
            { label: 'Palatino', value: '"Palatino Linotype", serif' },
            { label: 'Impact', value: 'Impact, sans-serif' },
            { label: 'Garamond', value: 'Garamond, serif' },
          ];
          const TEXT_PRESETS = [
            { label: 'Title',    fontSize: 42, bold: true,  italic: false, letterSpacing: 2,  color: '#ffffff', shadow: 6 },
            { label: 'Subtitle', fontSize: 22, bold: false, italic: true,  letterSpacing: 1,  color: '#e0e0e0', shadow: 4 },
            { label: 'Caption',  fontSize: 14, bold: false, italic: false, letterSpacing: 0.5,color: '#cccccc', shadow: 3 },
            { label: 'Quote',    fontSize: 18, bold: false, italic: true,  letterSpacing: 0,  color: '#ffffff', shadow: 4 },
            { label: 'Date',     fontSize: 12, bold: false, italic: false, letterSpacing: 3,  color: '#aaaaaa', shadow: 2 },
          ];
          return (
            <div
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                left: capToolbar.cx,
                top: Math.max(4, capToolbar.top),
                transform: 'translateX(-50%)',
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: 6,
                padding: '6px 8px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                zIndex: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                minWidth: 340,
              }}
            >
              {/* Row 1: style controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, color: '#444', marginRight: 2 }}>Text</span>

                <select
                  value={selCap.fontFamily || 'system-ui, sans-serif'}
                  onChange={(e) => upd({ fontFamily: e.target.value })}
                  style={{ background: '#181818', border: '1px solid #252525', borderRadius: 3, color: '#888', fontSize: 10, padding: '2px 4px', cursor: 'pointer' }}
                >
                  {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                </select>

                <input type="number" value={selCap.fontSize || 18} min={6} max={200}
                  onChange={(e) => upd({ fontSize: Number(e.target.value) })}
                  style={{ width: 38, background: '#181818', border: '1px solid #252525', borderRadius: 3, color: '#aaa', fontSize: 10, padding: '2px 4px', outline: 'none' }}
                  title="Font size"
                />

                <button style={cellBtnStyle({ color: selCap.bold ? '#fff' : '#555', fontWeight: 'bold', padding: '3px 6px' })}
                  onClick={() => upd({ bold: !selCap.bold })} title="Bold">B</button>

                <button style={cellBtnStyle({ color: selCap.italic ? '#fff' : '#555', fontStyle: 'italic', padding: '3px 6px' })}
                  onClick={() => upd({ italic: !selCap.italic })} title="Italic">I</button>

                <input type="color" value={selCap.color || '#ffffff'}
                  onChange={(e) => upd({ color: e.target.value })}
                  style={{ width: 22, height: 22, border: 'none', cursor: 'pointer', background: 'none', padding: 0 }}
                  title="Text color"
                />

                {['left','center','right'].map((align) => (
                  <button key={align}
                    style={cellBtnStyle({ color: selCap.align === align ? '#4f8ef7' : '#555', padding: '3px 5px', fontSize: 9 })}
                    onClick={() => upd({ align })}
                  >
                    {align === 'left' ? '⬤◯◯' : align === 'center' ? '◯⬤◯' : '◯◯⬤'}
                  </button>
                ))}

                <button style={cellBtnStyle()} title="Edit text"
                  onClick={() => setEditingCaption({ ...selCap })}>✎ Edit</button>

                <div style={{ width: 1, height: 16, background: '#2a2a2a', marginLeft: 'auto' }} />
                <button style={cellBtnStyle({ color: '#e05c5c', borderColor: 'transparent' })}
                  onClick={() => { removeCaption(activeSpreadId, selCap.id); setSelectedCaptionId(null); }}>✕</button>
              </div>

              {/* Row 2: letter spacing + shadow + presets */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 9, color: '#444' }}>Spacing</span>
                <input type="range" min={-2} max={20} step={0.5} value={selCap.letterSpacing ?? 0}
                  onChange={(e) => upd({ letterSpacing: parseFloat(e.target.value) })}
                  style={{ width: 60, accentColor: '#4f8ef7' }} />
                <span style={{ fontSize: 9, color: '#444' }}>Shadow</span>
                <input type="range" min={0} max={20} step={1} value={selCap.shadow ?? 4}
                  onChange={(e) => upd({ shadow: parseInt(e.target.value) })}
                  style={{ width: 50, accentColor: '#4f8ef7' }} />
                <div style={{ width: 1, height: 12, background: '#2a2a2a' }} />
                {TEXT_PRESETS.map((p) => (
                  <button key={p.label}
                    style={{ ...cellBtnStyle({ padding: '2px 7px', fontSize: 9 }), fontStyle: p.italic ? 'italic' : 'normal', fontWeight: p.bold ? 'bold' : 'normal' }}
                    onClick={() => upd(p)}
                  >{p.label}</button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Caption text editor overlay */}
        {editingCaption && (
          <textarea
            autoFocus
            defaultValue={editingCaption.text}
            style={{
              position: 'absolute',
              left: editingCaption.x * SPREAD_W,
              top: editingCaption.y * SPREAD_H,
              width: editingCaption.w * SPREAD_W,
              background: 'rgba(0,0,0,0.88)',
              border: '1px solid #4f8ef7',
              borderRadius: 3,
              color: editingCaption.color || '#fff',
              fontSize: editingCaption.fontSize || 18,
              fontWeight: editingCaption.bold ? 'bold' : 'normal',
              textAlign: editingCaption.align || 'left',
              padding: '2px 4px',
              resize: 'none',
              outline: 'none',
              zIndex: 30,
              minHeight: 36,
              lineHeight: 1.4,
              boxSizing: 'border-box',
            }}
            onBlur={(e) => {
              updateCaption(activeSpreadId, editingCaption.id, { text: e.target.value });
              setEditingCaption(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditingCaption(null);
              if (e.key === 'Enter' && !e.shiftKey) {
                updateCaption(activeSpreadId, editingCaption.id, { text: e.target.value });
                setEditingCaption(null);
                e.preventDefault();
              }
            }}
          />
        )}

        {/* Add Cell panel — shown when user clicks empty canvas space */}
        {ghostCell && ghostGeo && (
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: (ghostGeo.x + ghostGeo.w / 2) * SPREAD_W,
              top: Math.min(
                (ghostGeo.y + ghostGeo.h) * SPREAD_H + 8,
                SPREAD_H - 90
              ),
              transform: 'translateX(-50%)',
              background: '#141414',
              border: '1px solid #2a2a2a',
              borderRadius: 8,
              padding: '8px 10px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
              zIndex: 30,
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
              minWidth: 200,
            }}
          >
            <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, textTransform: 'uppercase' }}>
              Add Cell
            </div>

            {/* Shape presets */}
            <div style={{ display: 'flex', gap: 5 }}>
              {Object.entries(PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setGhostPreset(key)}
                  style={{
                    flex: 1,
                    padding: '5px 4px',
                    background: ghostPreset === key ? '#1a2a4a' : '#181818',
                    border: `1px solid ${ghostPreset === key ? '#4f8ef7' : '#252525'}`,
                    borderRadius: 4,
                    color: ghostPreset === key ? '#4f8ef7' : '#666',
                    fontSize: 10,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {/* Tiny shape thumbnail */}
                  <svg
                    width={key === '169' ? 22 : key === 'sq' ? 14 : 10}
                    height={key === '169' ? 12 : key === 'sq' ? 14 : 18}
                    style={{ display: 'block' }}
                  >
                    <rect
                      x={0} y={0}
                      width={key === '169' ? 22 : key === 'sq' ? 14 : 10}
                      height={key === '169' ? 12 : key === 'sq' ? 14 : 18}
                      rx={1}
                      fill={ghostPreset === key ? '#4f8ef7' : '#333'}
                    />
                  </svg>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            {/* Confirm / dismiss */}
            <div style={{ display: 'flex', gap: 5 }}>
              <button
                onClick={() => {
                  addCellAt(activeSpreadId, ghostGeo);
                  setGhostCell(null);
                }}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  background: '#1a3580',
                  border: 'none',
                  borderRadius: 4,
                  color: '#fff',
                  fontSize: 11,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                + Add Cell
              </button>
              <button
                onClick={() => setGhostCell(null)}
                style={{
                  padding: '6px 10px',
                  background: 'transparent',
                  border: '1px solid #252525',
                  borderRadius: 4,
                  color: '#555',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Hidden file input for direct cell photo pick */}
        <input
          ref={cellFileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleCellFileChange}
        />

        {/* Add text button (bottom-right of canvas) */}
        <button
          onClick={handleAddCaption}
          title="Add text overlay"
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: 'rgba(20,20,20,0.85)',
            border: '1px solid #2a2a2a',
            borderRadius: 4,
            color: '#666',
            fontSize: 11,
            cursor: 'pointer',
            padding: '4px 9px',
            zIndex: 10,
          }}
        >
          T+ Text
        </button>
      </div>
      </div>
      </div>

      {/* Zoom controls — anchored to canvas viewport, NOT inside scroll area */}
      <div style={{
        position: 'absolute', bottom: 12, left: '50%',
        transform: 'translateX(-50%)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: 'rgba(20,20,20,0.94)',
        border: '1px solid #2a2a2a', borderRadius: 8,
        padding: '6px 8px',
        boxShadow: '0 6px 22px rgba(0,0,0,0.65)',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
      }}>
        <button onClick={() => setZoomClamped(zoom / 1.25)} style={zoomBtnStyle} title="Zoom out (Cmd/Ctrl + wheel)">−</button>

        {/* Slider */}
        <input
          type="range"
          min="25" max="400" step="5"
          value={Math.round(zoom * 100)}
          onChange={(e) => setZoomClamped(Number(e.target.value) / 100)}
          style={{
            width: 120,
            accentColor: '#4f8ef7',
            cursor: 'pointer',
          }}
          title="Zoom level"
        />

        <button onClick={() => setZoomClamped(zoom * 1.25)} style={zoomBtnStyle} title="Zoom in (Cmd/Ctrl + wheel)">+</button>

        <div style={{ width: 1, height: 18, background: '#2a2a2a', margin: '0 2px' }} />

        {/* Quick-jump presets */}
        {[0.5, 1, 1.5, 2].map((preset) => (
          <button
            key={preset}
            onClick={() => setZoom(preset)}
            style={{
              ...zoomBtnStyle,
              minWidth: 40, fontSize: 10,
              background: Math.abs(zoom - preset) < 0.01 ? '#1e2535' : '#181818',
              color: Math.abs(zoom - preset) < 0.01 ? '#4f8ef7' : '#bbb',
              borderColor: Math.abs(zoom - preset) < 0.01 ? '#2c4070' : '#2a2a2a',
              fontWeight: Math.abs(zoom - preset) < 0.01 ? 600 : 400,
            }}
            title={`Set zoom to ${Math.round(preset * 100)}%`}
          >
            {Math.round(preset * 100)}%
          </button>
        ))}

        <button
          onClick={() => {
            const el = zoomContainerRef.current;
            if (!el) return;
            const padding = 48;
            const fitX = (el.clientWidth - padding) / SPREAD_W;
            const fitY = (el.clientHeight - padding) / SPREAD_H;
            setZoomClamped(Math.min(fitX, fitY));
          }}
          style={{ ...zoomBtnStyle, fontSize: 10, padding: '4px 10px' }}
          title="Fit spread to screen"
        >
          Fit
        </button>

        {/* Current zoom indicator */}
        <div style={{
          minWidth: 46, fontSize: 11, color: '#888',
          fontVariantNumeric: 'tabular-nums', textAlign: 'right',
          paddingLeft: 4,
        }}>
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
}

const zoomBtnStyle = {
  background: '#181818', border: '1px solid #2a2a2a',
  borderRadius: 4, color: '#bbb',
  fontSize: 14, padding: '4px 9px',
  cursor: 'pointer', lineHeight: 1,
  minWidth: 28, textAlign: 'center',
};
