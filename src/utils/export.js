import { getScreenDims, getExportPixelRatio } from '../layouts/spreadSizes';
import { useBookStore } from '../store/useBookStore';

function slug(name) {
  return name.replace(/[^a-z0-9]/gi, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'photobook';
}

// Swap each photo's src for its originalSrc (full-resolution version),
// pre-load the originals into the browser cache so the canvas re-renders
// without flicker, run the callback (which captures the canvas), then
// restore the downscaled srcs.
async function withOriginalPhotos(callback) {
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
    const dataURL = stageRef.current.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality: 0.95 });
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
  await withOriginalPhotos(() => {
    const dataURL = stageRef.current.toDataURL({ pixelRatio, mimeType: 'image/jpeg', quality: 0.95 });
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `${slug(bookName)}-spread-${String(spreadId).padStart(2, '0')}.jpg`;
    a.click();
  });
}

// Export all spreads as a print-ready PDF via the browser print dialog
export async function exportAsPDF(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  const frames = await withOriginalPhotos(() =>
    captureAll(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize)
  );

  const win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this app to use PDF export.');
    return;
  }

  const pages = frames.map(({ idx, dataURL, role }) => `
    <div class="page">
      <img src="${dataURL}" alt="Spread ${idx}">
      ${role ? `<div class="badge">${role.toUpperCase()}</div>` : ''}
    </div>
  `).join('');

  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${bookName} — Print</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 0; }
    .page {
      position: relative; width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
      background: #000; page-break-after: always; break-after: page;
    }
    .page img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .badge {
      position: absolute; top: 12px; left: 12px;
      font-family: sans-serif; font-size: 10px; font-weight: bold;
      letter-spacing: 1.5px; color: #f6c90e;
    }
  </style>
</head>
<body>${pages}</body>
</html>`);
  win.document.close();
  setTimeout(() => win.print(), 600);
}

// Kept for any legacy callers
export async function exportAllSpreads(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName) {
  return exportToFolder(stageRef, spreads, activeSpreadId, setActiveSpread, spreadSizeId, customSize, bookName);
}
