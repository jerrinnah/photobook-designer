// Client-side face prioritization.
//
// Uses @vladmandic/face-api (a maintained face-api.js fork) loaded from
// CDN ON DEMAND — nothing ships in the main bundle, and no model weights
// are downloaded until the photographer actually uses the feature.
//
// Privacy: all detection + matching runs in the browser. No photo and no
// face data ever leaves the device.
//
// Flow:
//   1. loadFaceApi()  — injects the library + loads the 3 model nets once
//   2. getKeyDescriptor(imgEl) — returns the dominant face's 128-d vector
//      from a reference photo the user picked
//   3. scorePhotos(photos, keyDescriptor, onProgress) — returns a Map of
//      photoId → priority (0..1) based on how closely + prominently the
//      key person appears
//
// NOTE: CDN model loading needs internet. For the fully-offline desktop
// build we'd bundle the weights into public/models and point MODEL_URL
// there instead — deferred until the feature proves itself.

const FACEAPI_SCRIPT = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/dist/face-api.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model';

// Euclidean distance below this = same person (face-api's standard cutoff).
const MATCH_THRESHOLD = 0.55;

let _loadPromise = null;

function injectScript(src) {
  return new Promise((resolve, reject) => {
    if (window.faceapi) return resolve(window.faceapi);
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.faceapi));
      existing.addEventListener('error', reject);
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve(window.faceapi);
    el.onerror = () => reject(new Error('Could not load the face-recognition library. Check your internet connection.'));
    document.head.appendChild(el);
  });
}

export async function loadFaceApi() {
  if (_loadPromise) return _loadPromise;
  _loadPromise = (async () => {
    const faceapi = await injectScript(FACEAPI_SCRIPT);
    if (!faceapi) throw new Error('face-api failed to initialize.');
    // TinyFaceDetector (fast, small) + landmarks + recognition net.
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
    await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
    return faceapi;
  })().catch((e) => {
    _loadPromise = null; // allow retry on failure
    throw e;
  });
  return _loadPromise;
}

// Load an <img> from a data/blob URL, fully decoded and ready for the net.
function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = src;
  });
}

const detectOpts = (faceapi) => new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 });

// Detect every face in an image, with descriptors. Returns
// [{ descriptor: Float32Array, box: {x,y,width,height}, score }].
async function detectFaces(faceapi, imgEl) {
  const results = await faceapi
    .detectAllFaces(imgEl, detectOpts(faceapi))
    .withFaceLandmarks()
    .withFaceDescriptors();
  return results.map((r) => ({
    descriptor: r.descriptor,
    box: r.detection.box,
    score: r.detection.score,
  }));
}

// From a reference photo, return the dominant face's descriptor — the
// largest detected face (most likely the intended subject).
export async function getKeyDescriptor(src) {
  const faceapi = await loadFaceApi();
  const img = await loadImageEl(src);
  const faces = await detectFaces(faceapi, img);
  if (faces.length === 0) return null;
  faces.sort((a, b) => (b.box.width * b.box.height) - (a.box.width * a.box.height));
  return faces[0].descriptor;
}

// Score every photo against the key descriptor. Returns Map<id, score>
// where score is 0 (no match) up to ~1 (strong, prominent match).
// Prominence: a closer match AND a larger face on the photo → higher.
export async function scorePhotos(photos, keyDescriptor, onProgress) {
  const faceapi = await loadFaceApi();
  const scores = new Map();
  let done = 0;
  for (const p of photos) {
    try {
      const img = await loadImageEl(p.src);
      const faces = await detectFaces(faceapi, img);
      let best = 0;
      const imgArea = (img.naturalWidth || img.width) * (img.naturalHeight || img.height) || 1;
      for (const f of faces) {
        const dist = faceapi.euclideanDistance(f.descriptor, keyDescriptor);
        if (dist <= MATCH_THRESHOLD) {
          // similarity 0..1 (closer = higher)
          const sim = 1 - (dist / MATCH_THRESHOLD);
          // prominence 0..1 (bigger face on the photo = higher), capped
          const faceArea = f.box.width * f.box.height;
          const prom = Math.min(1, (faceArea / imgArea) * 8);
          const combined = sim * 0.7 + prom * 0.3;
          if (combined > best) best = combined;
        }
      }
      if (best > 0) scores.set(p.id, Number(best.toFixed(4)));
    } catch { /* skip un-decodable photo */ }
    done++;
    onProgress?.(done, photos.length, scores.size);
    // Yield so the UI stays responsive between photos.
    await new Promise((r) => setTimeout(r, 0));
  }
  return scores;
}
