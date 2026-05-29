import { jsPDF } from 'jspdf';
import { getScreenDims, getExportPixelRatio, getEffectiveExportSize } from '../layouts/spreadSizes';
import { useBookStore } from '../store/useBookStore';
import { getStoredUser } from './supabase';
import { getEffectiveTier } from './premium';

function slug(name) {
  return name.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'photobook';
}

// Returns true if the user is in the free (post-trial) state — used to
// decide whether to stamp a watermark on exports. Trial users get clean
// exports too, since the whole point of trial is to demo full Premium.
function isFreeTier() {
  return getEffectiveTier(getStoredUser()) === 'free';
}

// Brand info — premium users may have customized. Falls back to AutoBook.
function getBrand() {
  const u = getStoredUser();
  const b = u?.brand || {};
  return {
    name: b.name || 'AutoBook by NEJ',
    siteUrl: b.siteUrl || 'autobookbynej.online',
    color: b.color || null,
    logoUrl: b.logoUrl || null,
  };
}

// Draw a tiled "AutoBook by NEJ" watermark across the image, plus a small
// solid badge in the bottom-right corner. Returns a new data URL.
async function applyWatermark(dataURL) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      // Tiled diagonal watermark — subtle but visible enough to discourage
      // commercial use of the free export.
      const baseFontSize = Math.max(16, Math.round(img.width / 60));
      ctx.font = `${baseFontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(img.width / 2, img.height / 2);
      ctx.rotate(-Math.PI / 6); // ~-30°
      const text = '  AUTOBOOK BY NEJ  ·  AUTOBOOK BY NEJ  ·  ';
      const w = ctx.measureText(text).width;
      const rowSpacing = baseFontSize * 4;
      const rows = Math.ceil(img.height / rowSpacing) + 4;
      for (let r = -rows; r < rows; r++) {
        ctx.fillText(text, -w / 2 - ((r * 80) % w), r * rowSpacing);
      }
      ctx.restore();

      // Solid corner badge
      const padding = Math.round(img.width / 100);
      const badgeFont = Math.max(12, Math.round(img.width / 80));
      ctx.font = `bold ${badgeFont}px system-ui, -apple-system, sans-serif`;
      const badgeText = 'AutoBook by NEJ · autobookbynej.online';
      const badgeWidth = ctx.measureText(badgeText).width + padding * 2;
      const badgeHeight = badgeFont * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(
        img.width - badgeWidth - padding,
        img.height - badgeHeight - padding,
        badgeWidth, badgeHeight
      );
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        badgeText,
        img.width - badgeWidth - padding + padding,
        img.height - padding - badgeHeight / 2
      );

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(dataURL); // on error, fall back to original
    img.src = dataURL;
  });
}

async function maybeWatermark(dataURL) {
  if (!isFreeTier()) return dataURL;
  return applyWatermark(dataURL);
}

// Standard photobook bleed = 0.125 inch on every side.
const BLEED_INCHES = 0.125;

// Extends a captured spread by `bleedPx` on every side using edge-pixel
// replication. This is the classic press technique — the printer trims
// the bleed off so even slight cutting drift doesn't expose white.
async function extendForBleed(dataURL, bleedPx) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const W = img.width;
      const H = img.height;
      const newW = W + 2 * bleedPx;
      const newH = H + 2 * bleedPx;
      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');

      // Corners — stretch each corner pixel to fill its bleed quadrant
      ctx.drawImage(img, 0,   0,   1, 1, 0,           0,           bleedPx, bleedPx);
      ctx.drawImage(img, W-1, 0,   1, 1, W + bleedPx, 0,           bleedPx, bleedPx);
      ctx.drawImage(img, 0,   H-1, 1, 1, 0,           H + bleedPx, bleedPx, bleedPx);
      ctx.drawImage(img, W-1, H-1, 1, 1, W + bleedPx, H + bleedPx, bleedPx, bleedPx);
      // Top + bottom strips — repeat the first / last row
      ctx.drawImage(img, 0, 0,   W, 1, bleedPx, 0,           W, bleedPx);
      ctx.drawImage(img, 0, H-1, W, 1, bleedPx, H + bleedPx, W, bleedPx);
      // Left + right strips — repeat first / last column
      ctx.drawImage(img, 0,   0, 1, H, 0,           bleedPx, bleedPx, H);
      ctx.drawImage(img, W-1, 0, 1, H, W + bleedPx, bleedPx, bleedPx, H);
      // Original image in the center
      ctx.drawImage(img, bleedPx, bleedPx, W, H);

      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

// Swap each photo's src for its originalSrc (full-resolution version),
// pre-load the originals into the browser cache so the canvas re-renders
// without flicker, run the callback (which captures the canvas), then
// restore the downscaled srcs.
// Wait for any in-flight web font loads to finish so canvas captures them
// instead of the fallback font.
async function waitForFonts() {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* ignore */ }
  }
}

async function withOriginalPhotos(callback) {
  await waitForFonts();
  const state = useBookStore.getState();
  const originalPhotos = state.photos;
  const needsSwap = originalPhotos.some((p) => p.originalSrc && p.originalSrc !== p.src);

  if (!needsSwap) {
    return callback();
  }

  // Pre-load originals so the swap render shows full-res images immediately
  await Promise.all(
    originalPhotos
      .filter((p) => p.originalSrc && p.originalSrc !== p.src)
      .map((p) => new Promise((resolve) => {
        const img = new window.Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = p.originalSrc;
      }))
  );

  const swapped = originalPhotos.map((p) =>
    p.originalSrc && p.originalSrc !== p.src
      ? { ...p, src: p.originalSrc, width: p.origWidth || p.width, height: p.origHeight || p.height }
      : p
  );
  useBookStore.setState({ photos: swapped });

  // Give Konva a frame to repaint with the new sources
  await new Promise((r) => setTimeout(r, 350));

  try {
    return await callback();
  } finally {
    useBookStore.setState({ photos: originalPhotos });
  }
}

// A spread is "designed" iff at least one cell has a photo placed.
// We skip undesigned spreads (including an empty cover) on export so
// users don't get blank pages in their PDF / numbered blank JPGs.
function isSpreadDesigned(spread) {
  if (!spread?.cells || !Array.isArray(spread.cells)) return false;
  return spread.cells.some((c) => c?.photoId != null);
}

// Render each spread in sequence, collect data URLs, restore active spread.
// Empty spreads (no photos placed) are skipped — including an empty cover.
async function captureAll(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize) {
  const origId = activeSpreadId;
  const { w: screenW } = getScreenDims(spreadSizeId, customSize);
  const pixelRatio = getExportPixelRatio(spreadSizeId, screenW, customSize);

  // Clear any active selection BEFORE capturing so the blue resize
  // handles / selection outline / group bbox never bleed into the
  // exported image. setActiveSpread already nulls the selection per
  // spread, but we clear up-front too in case the first captured
  // spread is the currently-active one.
  try { useBookStore.getState().setSelectedCell(null); } catch { /* ignore */ }

  // Filter to designed spreads only. Renumber so output is "01, 02, …"
  // contiguously rather than "01, 03, 05, …" with gaps.
  const designed = spreads.filter(isSpreadDesigned);
  const frames = [];

  for (let i = 0; i < designed.length; i++) {
    setActiveSpread(designed[i].id);
    // Belt-and-braces: ensure selection stays cleared for every frame.
    useBookStore.getState().setSelectedCell(null);
    await new Promise((r) => setTimeout(r, 220));
    // Force a fresh Konva draw so the layer reflects the cleared
    // selection (no lingering handles) before we rasterize.
    try { stageRef.current?.getLayers?.().forEach((l) => l.batchDraw()); } catch { /* ignore */ }
    let dataURL = stageRef.current.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality: 0.95 });
    dataURL = await maybeWatermark(dataURL);
    frames.push({ idx: i + 1, dataURL, role: designed[i].role });
  }

  setActiveSpread(origId);
  return frames;
}

function dataURLtoBytes(dataURL) {
  const base64 = dataURL.slice(dataURL.indexOf(',') + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Export all spreads as JPGs into a user-chosen folder (File System Access API).
// Falls back to individual browser downloads if the API is unavailable.
// Empty spreads (no photos placed) are skipped — including an empty cover.
//
// Order is intentional: ASK FOR THE FOLDER FIRST while the user gesture
// from the export click is still active. Then capture all spreads (which
// can take 5-10s for big books). Capturing first would consume the
// gesture and showDirectoryPicker() would get rejected as "not user-
// activated".
export async function exportToFolder(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  const bookSlug = slug(bookName);

  // 1. Folder picker FIRST while user gesture is fresh.
  let dirHandle = null;
  if (typeof window.showDirectoryPicker === 'function') {
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled the picker
      // API available but failed for another reason — fall through to download fallback
      dirHandle = null;
    }
  }

  // 2. Capture every spread (with original-res photos swapped in).
  const frames = await withOriginalPhotos(() =>
    captureAll(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize)
  );
  if (frames.length === 0) {
    alert('Nothing to export — add photos to at least one spread first. (Try Design All to fill every spread in one click.)');
    return;
  }

  // 3. Write to the chosen directory if we got one; otherwise download.
  if (dirHandle) {
    for (const { idx, dataURL } of frames) {
      const filename = `${bookSlug}-spread-${String(idx).padStart(2, '0')}.jpg`;
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(dataURLtoBytes(dataURL));
      await writable.close();
    }
    return;
  }

  // Fallback: trigger browser download for each spread
  for (const { idx, dataURL } of frames) {
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${bookSlug}-spread-${String(idx).padStart(2, '0')}.jpg`;
    a.click();
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Single-spread export (used by "Export Spread" button)
export async function exportCurrentSpread(stageRef, spreadId, spreadSizeId, customSize, bookName) {
  const { w: screenW } = getScreenDims(spreadSizeId, customSize);
  const pixelRatio = getExportPixelRatio(spreadSizeId, screenW, customSize);
  await withOriginalPhotos(async () => {
    let dataURL = stageRef.current.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality: 0.95 });
    dataURL = await maybeWatermark(dataURL);
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${slug(bookName)}-spread-${String(spreadId).padStart(2, '0')}.jpg`;
    a.click();
  });
}

// Real print-ready PDF using jsPDF with proper bleed area.
// - Trim size = the spread's chosen dimensions (e.g. 20×10")
// - Page size in PDF = trim + 0.125" bleed on each side (e.g. 20.25×10.25")
// - Each spread image is extended into the bleed via edge-pixel replication
// - Crop marks sit AT the trim line so the printer's guillotine knows where to cut
// - First page is a spec sheet with project metadata
export async function exportAsPDF(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  const frames = await withOriginalPhotos(() =>
    captureAll(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize)
  );
  if (frames.length === 0) {
    alert('Nothing to export — add photos to at least one spread first. (Try Design All to fill every spread in one click.)');
    return;
  }

  // Compute physical page size from the export-resolution pixels at 300 DPI.
  const { exportW: pxW, exportH: pxH } = getEffectiveExportSize(spreadSizeId, customSize);
  const inchesW = pxW / 300;
  const inchesH = pxH / 300;

  // pt math: 1pt = 1/72 inch
  const trimPtW = inchesW * 72;
  const trimPtH = inchesH * 72;
  const bleedPt = BLEED_INCHES * 72;
  const pagePtW = trimPtW + 2 * bleedPt;
  const pagePtH = trimPtH + 2 * bleedPt;

  // Bleed in source-image pixels (matches the capture resolution = 300 DPI)
  const bleedPx = Math.round(BLEED_INCHES * 300);

  const pdf = new jsPDF({
    orientation: pagePtW >= pagePtH ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [pagePtW, pagePtH],
    compress: true,
  });

  // ── Spec sheet first ──────────────────────────────────────────────
  drawSpecSheet(pdf, {
    bookName,
    pageCount: frames.length,
    inchesW, inchesH,
    pxW, pxH,
    bleedInches: BLEED_INCHES,
    isFree: isFreeTier(),
    brand: getBrand(),
  });

  // ── Each spread becomes one page WITH bleed extension ─────────────
  for (let i = 0; i < frames.length; i++) {
    // Extend the captured spread image with bleed
    const bleededImage = await extendForBleed(frames[i].dataURL, bleedPx);

    pdf.addPage([pagePtW, pagePtH], pagePtW >= pagePtH ? 'landscape' : 'portrait');
    // The bled image fills the whole page (including bleed)
    pdf.addImage(bleededImage, 'JPEG', 0, 0, pagePtW, pagePtH, undefined, 'FAST');
    // Crop marks sit AT the trim edge — the printer cuts here
    drawCropMarks(pdf, pagePtW, pagePtH, bleedPt);
    // Page number — placed in the bleed area so it gets trimmed off
    pdf.setFontSize(7);
    pdf.setTextColor(120);
    pdf.text(`${i + 1} / ${frames.length}`, pagePtW / 2, pagePtH - 2, { align: 'center' });
  }

  pdf.save(`${slug(bookName)}-print-ready.pdf`);
}

// Draws a metadata cover page with project specs — useful for the printer.
function drawSpecSheet(pdf, info) {
  pdf.setFillColor(245, 242, 236);
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(28);
  pdf.setTextColor(40);
  pdf.text(info.bookName || 'Photobook', 40, 70);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(80);
  pdf.text(`Print specification — ${info.brand?.name || 'AutoBook by NEJ'}`, 40, 90);

  const bleed = info.bleedInches || 0.125;
  const pageInchesW = info.inchesW + 2 * bleed;
  const pageInchesH = info.inchesH + 2 * bleed;
  const lines = [
    ['Spreads', `${info.pageCount}`],
    ['Trim size (after cut)', `${info.inchesW.toFixed(2)}" × ${info.inchesH.toFixed(2)}"`],
    ['Page size (incl. bleed)', `${pageInchesW.toFixed(3)}" × ${pageInchesH.toFixed(3)}"`],
    ['Bleed applied', `${bleed.toFixed(3)}" (${(bleed * 25.4).toFixed(1)} mm) on every side`],
    ['Trim resolution', `${info.pxW} × ${info.pxH} px @ 300 DPI`],
    ['Crop marks', 'At trim line — printer cuts here'],
    ['Color space', 'RGB (convert to CMYK at press for offset)'],
    ['Safe zone', '0.25" (6 mm) inside trim'],
    ['Generated', new Date().toLocaleString()],
  ];

  pdf.setFontSize(10);
  let y = 130;
  for (const [label, value] of lines) {
    pdf.setTextColor(120);
    pdf.text(label, 40, y);
    pdf.setTextColor(40);
    pdf.text(value, 180, y);
    y += 18;
  }

  if (info.isFree) {
    y += 16;
    pdf.setFontSize(9);
    pdf.setTextColor(200, 100, 50);
    pdf.text('Free tier: spread pages carry an AutoBook by NEJ watermark.', 40, y);
    pdf.text('Upgrade to Premium at autobookbynej.online to remove.', 40, y + 14);
  }

  pdf.setFontSize(8);
  pdf.setTextColor(140);
  const footer = info.brand?.siteUrl || 'autobookbynej.online';
  pdf.text(footer, 40, pdf.internal.pageSize.getHeight() - 24);
}

// Crop marks at the TRIM line (inset by the bleed amount from each page edge).
// Each corner gets two short black lines extending from the trim into the
// bleed area, so the printer's guillotine knows exactly where to cut.
function drawCropMarks(pdf, pagePtW, pagePtH, bleedPt = 0) {
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.5);
  const L = 12;       // mark length
  // Trim coordinates (page edges minus bleed on each side)
  const x1 = bleedPt;
  const y1 = bleedPt;
  const x2 = pagePtW - bleedPt;
  const y2 = pagePtH - bleedPt;
  // Top-left corner: mark extends from trim outward into bleed
  pdf.line(x1 - L, y1, 0, y1);     pdf.line(x1, y1 - L, x1, 0);
  // Top-right
  pdf.line(x2, y1, x2 + L, y1);    pdf.line(x2, y1 - L, x2, 0);
  // Bottom-left
  pdf.line(x1 - L, y2, 0, y2);     pdf.line(x1, y2, x1, y2 + L);
  // Bottom-right
  pdf.line(x2, y2, x2 + L, y2);    pdf.line(x2, y2, x2, y2 + L);
}

// Kept for any legacy callers
export async function exportAllSpreads(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  return exportToFolder(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
}
