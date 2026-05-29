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
import { useBookStore } from '../store/useBookStore';

const BUCKET = 'share-previews';
const MAX_SPREAD_LONG_EDGE = 1200; // Crisp enough for retina previews; smaller = faster capture + upload
const SHARE_QUALITY = 0.62;        // 0.62 keeps perceptual quality at preview size, smaller files
const UPLOAD_CONCURRENCY = 6;      // semaphore cap — too high causes HOL blocking on slow uplinks
const UPLOAD_TIMEOUT_MS = 60_000;  // 60s per spread — anything slower indicates a real problem
const HEAD_CHECK_TIMEOUT_MS = 4_000; // remote cache probe; never block long
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

// Wait for the React + Konva pipeline to actually paint after a
// setActiveSpread call. Two rAFs guarantee at least one full frame
// of layout + composite. Konva's image-draw queue resolves within
// the same frame for cached `useImage` hits (which is the common
// case after the editor has loaded), so no trailing setTimeout is
// needed — saving ~60ms × N spreads per share.
function waitForRepaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

// ── Capture: render one spread to a WebP Blob ───────────────────────
async function captureOneSpread(stageRef, spread, setActiveSpread, index) {
  setActiveSpread(spread.id);
  // Clear selection so resize handles / outlines never appear in the
  // shared preview image.
  try { useBookStore.getState().setSelectedCell(null); } catch { /* ignore */ }
  await waitForRepaint();
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

// Probe Storage for a content-addressed object in parallel before any
// captures run. If it's already there, we skip both capture and upload
// for that spread. Returns a Map<hash, publicUrl>.
async function batchHeadCheck(userBucketKey, hashes) {
  const found = new Map();
  await Promise.all(hashes.map(async (hash) => {
    const path = `${userBucketKey}/${hash}.${SHARE_EXT}`;
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEAD_CHECK_TIMEOUT_MS);
      const head = await fetch(publicUrl, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      if (head.ok) found.set(hash, publicUrl);
    } catch { /* missing or timeout — treat as not present */ }
  }));
  return found;
}

// Upload one blob to the user's content-addressed slot.
async function uploadBlob(userBucketKey, hash, blob, spreadIdx) {
  const path = `${userBucketKey}/${hash}.${SHARE_EXT}`;
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

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
  return publicUrl;
}

// Broadcast share progress to any subscribers (ShareProgressToast)
function emitProgress(detail) {
  try { window.dispatchEvent(new CustomEvent('autobook:share-progress', { detail })); } catch { /* ignore */ }
}
function emitComplete(detail) {
  try { window.dispatchEvent(new CustomEvent('autobook:share-complete', { detail })); } catch { /* ignore */ }
}
function emitError(message) {
  try { window.dispatchEvent(new CustomEvent('autobook:share-error', { detail: { message } })); } catch { /* ignore */ }
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

  // Batch HEAD-check unresolved hashes in parallel. A fresh browser on
  // a re-share will have no local cache but Storage still has the
  // content-addressed files — this turns N serial HEAD-probes into one
  // parallel sweep, so unchanged spreads skip capture entirely.
  const unresolved = tasks.filter((t) => !t.cachedUrl);
  if (unresolved.length > 0) {
    const remoteHits = await batchHeadCheck(userBucketKey, unresolved.map((t) => t.hash));
    for (const task of unresolved) {
      const hit = remoteHits.get(task.hash);
      if (hit) {
        task.cachedUrl = hit;
        userCache[task.hash] = hit;
      }
    }
    if (remoteHits.size > 0) {
      cache[userBucketKey] = userCache;
      saveShareCache(cache);
    }
  }

  const cachedCount = tasks.filter((t) => t.cachedUrl).length;
  console.info(`[Share] ${cachedCount} of ${tasks.length} spreads cached — capturing ${tasks.length - cachedCount}`);

  // PIPELINE: captures must be sequential (one shared Konva stage), but
  // uploads run in the background as captures complete. So while spread
  // N+1 is rendering, spread N is already uploading. Net effect: total
  // time ≈ max(capture_seq, upload_concurrent) instead of the sum.
  //
  // The inFlight semaphore caps concurrent uploads at UPLOAD_CONCURRENCY
  // to avoid head-of-line blocking on slower uplinks.
  const finalized = new Array(tasks.length);
  const uploadPromises = [];
  const inFlight = new Set();
  let captureDone = 0;
  let uploadDone = 0;
  let bytes = 0;

  for (const task of tasks) {
    const fire = (data) => { onProgress?.(data); emitProgress(data); };

    // Cache hit — finalize immediately, no work
    if (task.cachedUrl) {
      finalized[task.idx] = {
        id: task.spread.id, role: task.spread.role,
        w: null, h: null, imageUrl: task.cachedUrl,
      };
      captureDone++;
      uploadDone++;
      fire({ stage: 'capture', done: captureDone, total: tasks.length, cached: cachedCount });
      continue;
    }

    // Sequential capture (waits for paint)
    const { w, h, blob } = await captureOneSpread(stage.stageRef, task.spread, stage.setActiveSpread, task.idx);
    captureDone++;
    fire({ stage: 'capture', done: captureDone, total: tasks.length, cached: cachedCount });

    // Throttle: if upload pool is saturated, wait for any one to finish
    while (inFlight.size >= UPLOAD_CONCURRENCY) {
      await Promise.race(inFlight);
    }

    // Fire upload concurrently — DON'T await
    const uploadPromise = (async () => {
      const url = await uploadBlob(userBucketKey, task.hash, blob, task.idx);
      userCache[task.hash] = url;
      cache[userBucketKey] = userCache;
      saveShareCache(cache);
      finalized[task.idx] = { id: task.spread.id, role: task.spread.role, w, h, imageUrl: url };
      bytes += blob.size;
      uploadDone++;
      fire({ stage: 'upload', done: uploadDone, total: tasks.length, cached: cachedCount, bytes });
    })();
    inFlight.add(uploadPromise);
    uploadPromise.finally(() => inFlight.delete(uploadPromise));
    uploadPromises.push(uploadPromise);
  }
  stage.setActiveSpread(stage.originalActiveId);

  // Wait for any in-flight uploads to finish before we create the share row
  await Promise.all(uploadPromises);

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
  if (error) { emitError(error.message); throw new Error(error.message); }
  const token = typeof data === 'string' ? data : data?.[0];
  if (!token) { emitError('Failed to create share'); throw new Error('Failed to create share'); }
  emitComplete({ token });
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
