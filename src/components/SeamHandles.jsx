import { Rect } from 'react-konva';
import { useBookStore } from '../store/useBookStore';

const EPS = 0.002;
const MIN_SIZE = 0.08;
const HIT = 8; // px wide hit area

function getSeams(cells) {
  const vMap = new Map(); // x → { leftCells, rightCells }
  const hMap = new Map(); // y → { topCells, bottomCells }

  cells.forEach((c, i) => {
    const r = Math.round((c.x + c.w) * 10000) / 10000;
    const b = Math.round((c.y + c.h) * 10000) / 10000;
    const l = Math.round(c.x * 10000) / 10000;
    const t = Math.round(c.y * 10000) / 10000;

    if (r > EPS && r < 1 - EPS) {
      if (!vMap.has(r)) vMap.set(r, { leftCells: [], rightCells: [] });
      vMap.get(r).leftCells.push(i);
    }
    if (l > EPS && l < 1 - EPS) {
      if (!vMap.has(l)) vMap.set(l, { leftCells: [], rightCells: [] });
      vMap.get(l).rightCells.push(i);
    }
    if (b > EPS && b < 1 - EPS) {
      if (!hMap.has(b)) hMap.set(b, { topCells: [], bottomCells: [] });
      hMap.get(b).topCells.push(i);
    }
    if (t > EPS && t < 1 - EPS) {
      if (!hMap.has(t)) hMap.set(t, { topCells: [], bottomCells: [] });
      hMap.get(t).bottomCells.push(i);
    }
  });

  const vSeams = [];
  vMap.forEach((sides, val) => {
    if (sides.leftCells.length && sides.rightCells.length) vSeams.push({ val, ...sides });
  });
  const hSeams = [];
  hMap.forEach((sides, val) => {
    if (sides.topCells.length && sides.bottomCells.length) hSeams.push({ val, ...sides });
  });

  return { vSeams, hSeams };
}

export default function SeamHandles({ spreadId, cells, spreadW, spreadH }) {
  const { setCellGeometry } = useBookStore();
  const { vSeams, hSeams } = getSeams(cells);

  const applyVerticalSeam = (oldVal, rawX) => {
    const newVal = rawX / spreadW;
    const delta = newVal - oldVal;
    setCellGeometry(spreadId, cells.map((c) => {
      const r = Math.round((c.x + c.w) * 10000) / 10000;
      const l = Math.round(c.x * 10000) / 10000;
      if (Math.abs(r - oldVal) < EPS) return { ...c, w: c.w + delta };
      if (Math.abs(l - oldVal) < EPS) return { ...c, x: c.x + delta, w: c.w - delta };
      return c;
    }));
  };

  const applyHorizontalSeam = (oldVal, rawY) => {
    const newVal = rawY / spreadH;
    const delta = newVal - oldVal;
    setCellGeometry(spreadId, cells.map((c) => {
      const b = Math.round((c.y + c.h) * 10000) / 10000;
      const t = Math.round(c.y * 10000) / 10000;
      if (Math.abs(b - oldVal) < EPS) return { ...c, h: c.h + delta };
      if (Math.abs(t - oldVal) < EPS) return { ...c, y: c.y + delta, h: c.h - delta };
      return c;
    }));
  };

  return (
    <>
      {vSeams.map((seam) => {
        const sx = seam.val * spreadW;
        const minX = Math.max(...seam.leftCells.map((i) => cells[i].x + MIN_SIZE)) * spreadW;
        const maxX = Math.min(...seam.rightCells.map((i) => (cells[i].x + cells[i].w) - MIN_SIZE)) * spreadW;
        return (
          <Rect
            key={`v-${seam.val}`}
            x={sx - HIT / 2} y={0} width={HIT} height={spreadH}
            fill="transparent"
            draggable
            dragBoundFunc={(pos) => ({ x: Math.max(minX - HIT/2, Math.min(maxX - HIT/2, pos.x)), y: 0 })}
            onDragEnd={(e) => {
              applyVerticalSeam(seam.val, e.target.x() + HIT / 2);
            }}
            onMouseEnter={(e) => {
              e.target.fill('rgba(79,142,247,0.35)');
              document.body.style.cursor = 'col-resize';
              e.target.getLayer().batchDraw();
            }}
            onMouseLeave={(e) => {
              e.target.fill('transparent');
              document.body.style.cursor = 'default';
              e.target.getLayer().batchDraw();
            }}
          />
        );
      })}
      {hSeams.map((seam) => {
        const sy = seam.val * spreadH;
        const minY = Math.max(...seam.topCells.map((i) => cells[i].y + MIN_SIZE)) * spreadH;
        const maxY = Math.min(...seam.bottomCells.map((i) => (cells[i].y + cells[i].h) - MIN_SIZE)) * spreadH;
        return (
          <Rect
            key={`h-${seam.val}`}
            x={0} y={sy - HIT / 2} width={spreadW} height={HIT}
            fill="transparent"
            draggable
            dragBoundFunc={(pos) => ({ x: 0, y: Math.max(minY - HIT/2, Math.min(maxY - HIT/2, pos.y)) })}
            onDragEnd={(e) => {
              applyHorizontalSeam(seam.val, e.target.y() + HIT / 2);
            }}
            onMouseEnter={(e) => {
              e.target.fill('rgba(79,142,247,0.35)');
              document.body.style.cursor = 'row-resize';
              e.target.getLayer().batchDraw();
            }}
            onMouseLeave={(e) => {
              e.target.fill('transparent');
              document.body.style.cursor = 'default';
              e.target.getLayer().batchDraw();
            }}
          />
        );
      })}
    </>
  );
}
