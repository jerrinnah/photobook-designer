import { jsPDF } from 'jspdf';
import { getScreenDims, getExportPixelRatio, getEffectiveExportSize } from '../layouts/spreadSizes';
import { useBookStore } from '../store/useBookStore';
import { getStoredUser } from './supabase';

function slug(name) {
  return name.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'photobook';
}

// Returns true if the signed-in user is NOT premium (or not signed in).
// Used to decide whether to stamp a watermark on exports.
function isFreeTier() {
  const u = getStoredUser();
  return !u || u.tier !== 'premium';
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

// Render each spread in sequence, collect data URLs, restore active spread.
async function captureAll(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize) {
  const origId = activeSpreadId;
  const { w: screenW } = getScreenDims(spreadSizeId, customSize);
  const pixelRatio = getExportPixelRatio(spreadSizeId, screenW, customSize);
  const frames = [];

  for (let i = 0; i < spreads.length; i++) {
    setActiveSpread(spreads[i].id);
    await new Promise((r) => setTimeout(r, 220));
    let dataURL = stageRef.current.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality: 0.95 });
    dataURL = await maybeWatermark(dataURL);
    frames.push({ idx: i + 1, dataURL, role: spreads[i].role });
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
export async function exportToFolder(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  const frames = await withOriginalPhotos(() =>
    captureAll(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize)
  );
  const bookSlug = slug(bookName);

  // Try folder-picker first
  if (typeof window.showDirectoryPicker === 'function') {
    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'pictures' });
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
      // API available but failed — fall through to download
    }

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

// Real print-ready PDF using jsPDF.
// Each spread becomes a single page sized to the exact export dimensions
// at 72 DPI (PDF point unit). Optional crop marks help the printer trim.
// First page is a spec sheet with project metadata.
export async function exportAsPDF(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  const frames = await withOriginalPhotos(() =>
    captureAll(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize)
  );
  if (frames.length === 0) return;

  // Compute physical page size from the export-resolution pixels at 300 DPI.
  // PDF unit is 1pt = 1/72 inch, so multiply inches by 72 to get pt.
  const { exportW: pxW, exportH: pxH } = getEffectiveExportSize(spreadSizeId, customSize);
  const inchesW = pxW / 300;
  const inchesH = pxH / 300;
  const ptW = inchesW * 72;
  const ptH = inchesH * 72;

  const pdf = new jsPDF({
    orientation: ptW >= ptH ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [ptW, ptH],
    compress: true,
  });

  // ── Spec sheet first ──────────────────────────────────────────────
  drawSpecSheet(pdf, {
    bookName,
    pageCount: frames.length,
    inchesW, inchesH,
    pxW, pxH,
    isFree: isFreeTier(),
  });

  // ── Each spread becomes one page ──────────────────────────────────
  for (let i = 0; i < frames.length; i++) {
    pdf.addPage([ptW, ptH], ptW >= ptH ? 'landscape' : 'portrait');
    pdf.addImage(frames[i].dataURL, 'JPEG', 0, 0, ptW, ptH, undefined, 'FAST');
    drawCropMarks(pdf, ptW, ptH);
    // Page number on the back of crop marks
    pdf.setFontSize(8);
    pdf.setTextColor(120);
    pdf.text(`${i + 1} / ${frames.length}`, ptW / 2, ptH - 6, { align: 'center' });
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
  pdf.text('Print specification — AutoBook by NEJ', 40, 90);

  const lines = [
    ['Spreads', `${info.pageCount}`],
    ['Spread size', `${info.inchesW.toFixed(2)}" × ${info.inchesH.toFixed(2)}"`],
    ['Pixel resolution', `${info.pxW} × ${info.pxH} px @ 300 DPI`],
    ['Page size in PDF', `${(info.inchesW * 72).toFixed(0)} × ${(info.inchesH * 72).toFixed(0)} pt`],
    ['Color space', 'RGB (convert to CMYK at press for offset)'],
    ['Recommended bleed', '0.125" (3 mm) — add at press'],
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
  pdf.text('autobookbynej.online', 40, pdf.internal.pageSize.getHeight() - 24);
}

// Crop marks at each corner — 12pt long, 8pt offset from page edge.
function drawCropMarks(pdf, ptW, ptH) {
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.5);
  const L = 12;   // mark length
  const G = 8;    // gap from page edge
  // top-left
  pdf.line(0, G, L, G);          pdf.line(G, 0, G, L);
  // top-right
  pdf.line(ptW - L, G, ptW, G);  pdf.line(ptW - G, 0, ptW - G, L);
  // bottom-left
  pdf.line(0, ptH - G, L, ptH - G);                  pdf.line(G, ptH - L, G, ptH);
  // bottom-right
  pdf.line(ptW - L, ptH - G, ptW, ptH - G);          pdf.line(ptW - G, ptH - L, ptW - G, ptH);
}

// Kept for any legacy callers
export async function exportAllSpreads(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  return exportToFolder(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
}
