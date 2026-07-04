// Auto-color-match a batch of photos to a reference photo.
//
// Approach (fast, browser-only, no ML models):
//   1. For each photo, sample the image down to 64×64 and compute
//      per-channel mean + standard deviation in linear RGB.
//   2. For each non-reference photo, derive per-channel gain + offset
//      so its mean/stddev match the reference's. This is the "Reinhard
//      colour transfer" simplification, minus the LAB conversion —
//      cheap and good enough for correcting exposure / white-balance
//      drift across a wedding batch.
//   3. Convert the RGB adjustments into the existing brightness /
//      contrast / saturation slider space and stash them as cell
//      effects. Nothing about the actual pixel data is modified — the
//      corrections apply live via Konva's filter chain, so users can
//      still fine-tune per cell.
//
// This runs on the DOWNSCALED src (not originalSrc) to stay fast.

const SAMPLE = 64;

function sampleImage(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
        // Return per-channel mean and variance.
        const n = SAMPLE * SAMPLE;
        let rSum = 0, gSum = 0, bSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2];
        }
        const rMean = rSum / n;
        const gMean = gSum / n;
        const bMean = bSum / n;
        let rVar = 0, gVar = 0, bVar = 0;
        for (let i = 0; i < data.length; i += 4) {
          rVar += (data[i] - rMean) ** 2;
          gVar += (data[i + 1] - gMean) ** 2;
          bVar += (data[i + 2] - bMean) ** 2;
        }
        rVar /= n; gVar /= n; bVar /= n;
        // Overall luminance mean/stddev too — drives brightness/contrast.
        const lumaMean = 0.299 * rMean + 0.587 * gMean + 0.114 * bMean;
        const lumaStd = Math.sqrt(0.299 * rVar + 0.587 * gVar + 0.114 * bVar);
        // Saturation proxy: mean color-distance from luma per pixel.
        // High = colorful, low = washed out.
        let satAcc = 0;
        for (let i = 0; i < data.length; i += 4) {
          const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          satAcc += Math.abs(data[i] - luma) + Math.abs(data[i + 1] - luma) + Math.abs(data[i + 2] - luma);
        }
        const satMean = satAcc / (n * 3);
        resolve({ rMean, gMean, bMean, lumaMean, lumaStd, satMean });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Compute the effects patch to steer a photo's palette toward the ref.
// The mapping is intentionally conservative — we clamp so a single
// pass never pushes anything past a plausible fine-tune range.
function computeAdjustment(sourceStats, refStats) {
  // Brightness: work in the [-1, 1] Konva Brighten range. Push the
  // source's mean luma toward the reference's, but scale to a max ±0.4
  // so we never blow highlights.
  const brightnessDelta = clamp((refStats.lumaMean - sourceStats.lumaMean) / 255, -0.4, 0.4);

  // Contrast: Konva Contrast is [-100, 100]. Match the standard-
  // deviation ratio, scaled and clamped.
  const stdRatio = sourceStats.lumaStd > 0
    ? refStats.lumaStd / sourceStats.lumaStd
    : 1;
  const contrastDelta = clamp((stdRatio - 1) * 60, -60, 60);

  // Saturation: HSV filter's `saturation` param is a signed multiplier
  // where 0 = neutral, positive = more saturated, negative = less.
  // Compare mean saturation proxies and scale.
  const satDelta = clamp((refStats.satMean - sourceStats.satMean) / 25, -2, 3);

  return {
    brightness: +brightnessDelta.toFixed(3),
    contrast: Math.round(contrastDelta),
    saturation: +satDelta.toFixed(2),
  };
}

// Public entry: given a reference photoId + a list of photos, return
// a Map<photoId, effectsPatch> for every OTHER photo.
export async function computeColorMatchAcrossPhotos(refPhoto, photos, onProgress) {
  if (!refPhoto?.src) throw new Error('Reference photo has no source.');
  const refStats = await sampleImage(refPhoto.src);
  const patches = new Map();
  let done = 0;
  const targets = photos.filter((p) => p.id !== refPhoto.id && p.src);
  for (const p of targets) {
    try {
      const stats = await sampleImage(p.src);
      patches.set(p.id, computeAdjustment(stats, refStats));
    } catch { /* skip unreadable */ }
    done += 1;
    onProgress?.(done, targets.length);
  }
  return patches;
}
