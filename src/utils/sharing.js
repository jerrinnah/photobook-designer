// Client proofing / share-for-review utilities.
//
// Each spread is rendered to a WebP screenshot (reusing the existing
// Konva stage that the editor already uses for PDF / JPG export), then
// uploaded to the public `share-previews` Supabase Storage bucket.
//
// Compared to the old "send every photo" approach this is ~10× smaller
// because:
//   - One image per spread instead of one per source photo (a 20-spread
//     wedding book might pull from 184 source photos)
//   - Screen-size WebP instead of high-res JPEG
//   - The viewer just renders <img src={spread.imageUrl}> — no template
//     reconstruction, no per-cell math, no font / gradient state.

import { supabase, isSupabaseConfigured, getStoredUser } from './supabase';
import { getEffectiveTier } from './premium';

const BUCKET = 'share-previews';
const MAX_SPREAD_LONG_EDGE = 1800; // hard cap so a 12×24 spread doesn't blow up
const SHARE_QUALITY = 0.72;
const UPLOAD_CONCURRENCY = 4;
const UPLOAD_TIMEOUT_MS = 180_000; // 3 min per spread — generous for slow uploads
const CAPTURE_SETTLE_MS = 220;     // time for Konva stage to repaint after spread switch
const SHARE_CACHE_KEY = 'photobook-share-cache-v1';

// ── Content-addressed cache ─────────────────────────────────────────
// Each captured spread is uploaded to share-previews/{userId}/{hash}.webp
// where {hash} is a deterministic hash of the spread's visible state.
// Unchanged spreads on a re-share share the exact same path → already
// uploaded → skip render and upload entirely.

// djb2 — fast string hash, deterministic, plenty of bits for our purposes
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Capture only the bits that affect the final rendered pixels — anything
// else (UI-only state) is excluded so cosmetic changes don't invalidate
// the cache.
function hashSpread(spread) {
  const minimal = {
    bg: spread.bgColor || null,
    tmpl: spread.templateId || null,
    cells: (spread.cells || []).map((c) => ({
      p: c.photoId, z: c.zoom, ox: c.offsetX, oy: c.offsetY,
      mc: c.manualCrop, r: c.rotation, l: c.locked,
    })),
    geo: spread.cellGeometry,
    cap: spread.captions,
  };
  return djb2(JSON.stringify(minimal));
}

function loadShareCache() {
  try { return JSON.parse(localStorage.getItem(SHARE_CACHE_KEY) || '{}'); }
  catch { return {}; }
}
function saveShareCache(cache) {
  try { localStorage.setItem(SHARE_CACHE_KEY, JSON.stringify(cache)); }
  catch { localStorage.removeItem(SHARE_CACHE_KEY); }
}

const _webpProbe = (() => {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { return false; }
})();
const SHARE_MIME = _webpProbe ? 'image/webp' : 'image/jpeg';
const SHARE_EXT  = _webpProbe ? 'webp' : 'jpg';

// ── Capture: render one spread to a WebP Blob ───────────────────────
async function captureOneSpread(stageRef, spread, setActiveSpread, index) {
  setActiveSpread(spread.id);
  await new Promise((r) => setTimeout(r, CAPTURE_SETTLE_MS));
  const stage = stageRef.current;
  if (!stage) throw new Error('Editor stage disappeared mid-capture.');
  const w = stage.width();
  const h = stage.height();
  const longEdge = Math.max(w, h);
  const pixelRatio = longEdge > MAX_SPREAD_LONG_EDGE ? MAX_SPREAD_LONG_EDGE / longEdge : 1;
  const canvas = stage.toCanvas({ pixelRatio });
  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), SHARE_MIME, SHARE_QUALITY);
  });
  if (!blob) throw new Error(`Couldn't capture spread ${index + 1}`);
  console.info(`[Share] captured spread ${index + 1} — ${(blob.size / 1024).toFixed(0)} KB (${canvas.width}×${canvas.height})`);
  return { w, h, blob };
}

// Upload one blob to the user's content-addressed slot.
async function uploadBlob(userBucketKey, hash, blob, spreadIdx) {
  const path = `${userBucketKey}/${hash}.${SHARE_EXT}`;
  const startedAt = Date.now();
  console.info(`[Share] uploading spread ${spreadIdx + 1} → ${path} (${(blob.size / 1024).toFixed(0)} KB)…`);
  const { error } = await withTimeout(
    supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type,
      upsert: true,
      cacheControl: '604800',
    }),
    UPLOAD_TIMEOUT_MS,
    `Upload of spread ${spreadIdx + 1}`,
  );
  if (error) throw new Error(`Upload failed for spread ${spreadIdx + 1}: ${error.message}`);
  console.info(`[Share] spread ${spreadIdx + 1} uploaded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}

// Promise wrapper with a timeout — if `promise` doesn't settle in
// `ms` milliseconds, reject so the share doesn't hang forever.
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ── Main entry: createShare ─────────────────────────────────────────
// state: the relevant slice of useBookStore state (bookName, etc).
// stage: { stageRef, setActiveSpread, originalActiveId } — capture deps.
// onProgress: ({stage:'capture'|'upload', done, total, cached, bytes}) => void
//
// Smart re-share: each spread is hashed and the imageUrl cached locally
// under {userId}/{hash}.webp. Unchanged spreads on subsequent shares are
// reused instantly — no render, no upload. Only changed or new spreads
// pay the capture + upload cost.
export async function createShare(state, stage, onProgress) {
  const user = getStoredUser();
  if (!user?.id) throw new Error('Sign in first.');
  if (getEffectiveTier(user) === 'free') throw new Error('Paid plan or active trial required to share for review.');
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');

  // Verify the Supabase auth session is still valid BEFORE we burn time
  // capturing spreads. Storage upload + create_share RPC both require
  // an authenticated JWT; without one Storage RLS rejects with a confusing
  // "new row violates row-level security policy".
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Your sign-in session has expired. Please sign out (profile menu) and sign back in via magic link, then try sharing again.');
  }
  if (!stage?.stageRef?.current) throw new Error('Editor stage not ready — close and reopen the share dialog.');

  const spreads = state.spreads || [];
  if (spreads.length === 0) throw new Error('Nothing to share — add a spread first.');

  // The user's auth UUID becomes the storage folder. Content-addressed
  // path inside: {hash}.webp. Multiple shares from the same user reuse
  // the same path when a spread hasn't changed.
  const userBucketKey = session.user.id;
  const cache = loadShareCache();
  const userCache = cache[userBucketKey] || {};

  // Hash each spread first so we know what's cached vs needs work.
  const tasks = spreads.map((sp, i) => {
    const hash = hashSpread(sp);
    return { idx: i, spread: sp, hash, cachedUrl: userCache[hash] || null };
  });
  const cachedCount = tasks.filter((t) => t.cachedUrl).length;
  console.info(`[Share] ${cachedCount} of ${tasks.length} spreads cached — capturing ${tasks.length - cachedCount}`);

  // Walk spreads in order. Cached ones resolve instantly; uncached ones
  // need a Konva render + upload. Renders must be sequential because
  // they share the single editor stage.
  let done = 0;
  let bytes = 0;
  const finalized = [];
  for (const task of tasks) {
    if (task.cachedUrl) {
      finalized.push({
        id: task.spread.id, role: task.spread.role,
        w: null, h: null, imageUrl: task.cachedUrl,
      });
      done++;
      onProgress?.({ stage: 'capture', done, total: tasks.length, cached: cachedCount });
      continue;
    }
    // Not cached — render + upload
    const { w, h, blob } = await captureOneSpread(stage.stageRef, task.spread, stage.setActiveSpread, task.idx);
    const url = await uploadBlob(userBucketKey, task.hash, blob, task.idx);
    userCache[task.hash] = url;
    cache[userBucketKey] = userCache;
    saveShareCache(cache);
    bytes += blob.size;
    finalized.push({ id: task.spread.id, role: task.spread.role, w, h, imageUrl: url });
    done++;
    onProgress?.({ stage: 'upload', done, total: tasks.length, cached: cachedCount, bytes });
  }
  stage.setActiveSpread(stage.originalActiveId);

  // Build snapshot — URLs only, no template state.
  const snapshot = {
    bookName: state.bookName,
    spreadSizeId: state.spreadSizeId,
    customSize: state.customSize,
    spreads: finalized,
  };

  // Insert the row. share_key is now the user's content-addressed folder
  // (rather than a per-share folder); delete_share no longer purges
  // the bucket since files are shared across all the user's shares.
  const { data, error } = await supabase.rpc('create_share', {
    p_project_name: state.bookName || 'Untitled',
    p_share_key: userBucketKey,
    p_snapshot: snapshot,
  });
  if (error) throw new Error(error.message);
  const token = typeof data === 'string' ? data : data?.[0];
  if (!token) throw new Error('Failed to create share');
  return token;
}

export async function loadShare(token) {
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');
  const { data, error } = await supabase.rpc('get_shared_project', { p_token: token });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Share not found or link has expired.');
  return row;
}

export async function setShareStatus(token, status) {
  if (!isSupabaseConfigured) return;
  await supabase.rpc('set_share_status', { p_token: token, p_status: status });
}

// ── Per-spread feedback ────────────────────────────────────────────
// Anyone with the share token can read or post.

export async function addSpreadFeedback(token, spreadIdx, comment) {
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');
  const trimmed = (comment || '').trim();
  if (!trimmed) throw new Error('Please write something before sending.');
  if (trimmed.length > 1000) throw new Error('Comment is too long (max 1000 characters).');
  const { error } = await supabase.rpc('add_spread_feedback', {
    p_token: token,
    p_spread_idx: spreadIdx,
    p_comment: trimmed,
  });
  if (error) throw new Error(error.message);
}

export async function getSpreadFeedback(token) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('get_spread_feedback', { p_token: token });
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

export async function getMyShares() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('get_my_shares');
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

// Revoke a share — just delete the DB row. The actual image files
// stay in storage because they're content-addressed and may be
// referenced by other shares the user has created (or might create
// later, if they re-share an unchanged book).
export async function deleteShare(token) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('delete_share', { p_token: token });
  if (error) throw new Error(error.message);
}

export function buildShareUrl(token) {
  return `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(token)}`;
}
