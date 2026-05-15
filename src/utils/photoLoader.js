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

export async function loadPhoto(file) {
  const originalSrc = await readAsDataURL(file);
  const img = await loadImage(originalSrc);
  const { src, width, height } = await downscaleIfNeeded(originalSrc, img);
  const id = useBookStore.getState().nextPhotoId();
  return { id, name: file.name, src, width, height };
}
