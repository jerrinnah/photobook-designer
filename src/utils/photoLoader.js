import { useBookStore } from '../store/useBookStore';

// Photos imported from the file picker / dropzone are downscaled here.
// Why: phone photos are typically 4000×3000+ at 4–8 MB each as base64. With 50
// photos the project is ~250 MB in memory, exceeds the localStorage autosave
// cap, and Konva struggles to render full-res. 3000 px on the longest edge is
// enough for a full-page export at 300 DPI on every preset we ship (largest
// page = 14" → 4200 px, but a single photo rarely fills a whole page; in a
// spread of 3+ cells each cell receives ≤ 1500 px, well below 3000).

const MAX_DIM = 3000;
const JPEG_QUALITY = 0.92;

const readAsDataURL = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = (e) => res(e.target.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

// Extract the JPEG EXIF DateTimeOriginal timestamp (when the photo
// was actually shot, not when the file was written). Falls back to
// file.lastModified so timeline sort still works on non-JPEG or
// stripped-EXIF images. Returns a JS timestamp in ms.
async function readShotTime(file) {
  try {
    if (file.type !== 'image/jpeg') return file.lastModified || null;
    // Read only the first ~256 KB — EXIF lives at the file start.
    const slice = file.slice(0, 256 * 1024);
    const buf = await slice.arrayBuffer();
    const view = new DataView(buf);
    // JPEG must start with 0xFFD8
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return file.lastModified || null;
    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      offset += 2;
      // APP1 marker holds EXIF
      if (marker === 0xFFE1) {
        const size = view.getUint16(offset);
        offset += 2;
        if (view.getUint32(offset) !== 0x45786966) break; // "Exif"
        offset += 6; // skip Exif\0\0
        const tiffStart = offset;
        const little = view.getUint16(offset) === 0x4949;
        const getU16 = (o) => view.getUint16(o, little);
        const getU32 = (o) => view.getUint32(o, little);
        if (getU16(offset + 2) !== 0x002A) return file.lastModified || null;
        const ifd0 = tiffStart + getU32(offset + 4);
        const entries0 = getU16(ifd0);
        let exifOffset = 0;
        for (let i = 0; i < entries0; i++) {
          const entry = ifd0 + 2 + i * 12;
          const tag = getU16(entry);
          if (tag === 0x8769) { exifOffset = tiffStart + getU32(entry + 8); break; }
        }
        if (!exifOffset) return file.lastModified || null;
        const entries = getU16(exifOffset);
        for (let i = 0; i < entries; i++) {
          const entry = exifOffset + 2 + i * 12;
          const tag = getU16(entry);
          // 0x9003 = DateTimeOriginal, 0x9004 = DateTimeDigitized
          if (tag === 0x9003 || tag === 0x9004) {
            const count = getU32(entry + 4);
            const dataOffset = count > 4 ? tiffStart + getU32(entry + 8) : entry + 8;
            let str = '';
            for (let j = 0; j < 19; j++) {
              const b = view.getUint8(dataOffset + j);
              if (b === 0) break;
              str += String.fromCharCode(b);
            }
            // Format: "YYYY:MM:DD HH:MM:SS"
            const m = str.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
            if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
          }
        }
        break;
      }
      const size = view.getUint16(offset);
      offset += size;
    }
  } catch { /* EXIF parse failed — silent fallback */ }
  return file.lastModified || null;
}

const loadImage = (src) => new Promise((res, rej) => {
  const img = new window.Image();
  img.onload = () => res(img);
  img.onerror = rej;
  img.src = src;
});

// Returns { src, width, height } — downscaled if larger than MAX_DIM, else original.
const downscaleIfNeeded = async (originalSrc, img) => {
  const maxSide = Math.max(img.width, img.height);
  if (maxSide <= MAX_DIM) {
    return { src: originalSrc, width: img.width, height: img.height };
  }
  const scale = MAX_DIM / maxSide;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  // Preserve format hint: PNG (transparency) stays PNG, otherwise JPEG
  const isPng = originalSrc.startsWith('data:image/png');
  const src = isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { src, width: w, height: h };
};

export async function loadPhoto(file, batchMeta = null) {
  const originalSrc = await readAsDataURL(file);
  const img = await loadImage(originalSrc);
  const { src, width, height } = await downscaleIfNeeded(originalSrc, img);
  const shotAt = await readShotTime(file);
  const id = useBookStore.getState().nextPhotoId();
  // We keep BOTH versions so the canvas renders fast with the downscaled
  // `src` but exports can swap in `originalSrc` for full quality.
  // When src === originalSrc (small photo, didn't downscale) we still set
  // both so export logic doesn't need a special case.
  return {
    id, name: file.name, src, width, height,
    originalSrc,
    origWidth: img.width,
    origHeight: img.height,
    shotAt,                        // EXIF DateTimeOriginal or file mtime — used by Timeline sort
    ...(batchMeta ? {
      batchId: batchMeta.batchId,
      batchLabel: batchMeta.batchLabel,
      batchAt: batchMeta.batchAt,
    } : {}),
  };
}
