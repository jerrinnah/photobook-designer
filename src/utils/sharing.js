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

const _webpProbe = (() => {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { return false; }
})();
const SHARE_MIME = _webpProbe ? 'image/webp' : 'image/jpeg';
const SHARE_EXT  = _webpProbe ? 'webp' : 'jpg';

// ── Capture: render every spread to a WebP Blob ─────────────────────
// stageRef.current is the Konva Stage. We flip activeSpreadId one
// at a time, wait for the editor to repaint, then snapshot.
async function captureSpreadsForShare({
  stageRef, spreads, setActiveSpread, originalActiveId, onProgress,
}) {
  if (!stageRef?.current) throw new Error('Editor stage not ready — close the share dialog and try again.');
  const captured = [];
  for (let i = 0; i < spreads.length; i++) {
    const sp = spreads[i];
    setActiveSpread(sp.id);
    await new Promise((r) => setTimeout(r, CAPTURE_SETTLE_MS));

    const stage = stageRef.current;
    if (!stage) throw new Error('Editor stage disappeared mid-capture.');
    const w = stage.width();
    const h = stage.height();
    // Cap the long edge so big square/portfolio spreads don't produce
    // multi-MB WebPs that take forever to upload.
    const longEdge = Math.max(w, h);
    const pixelRatio = longEdge > MAX_SPREAD_LONG_EDGE ? MAX_SPREAD_LONG_EDGE / longEdge : 1;
    const canvas = stage.toCanvas({ pixelRatio });
    const blob = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), SHARE_MIME, SHARE_QUALITY);
    });
    if (!blob) throw new Error(`Couldn't capture spread ${i + 1}`);
    console.info(`[Share] captured spread ${i + 1} — ${(blob.size / 1024).toFixed(0)} KB (${canvas.width}×${canvas.height})`);
    captured.push({ id: sp.id, role: sp.role, w, h, blob });
    onProgress?.({ stage: 'capture', done: i + 1, total: spreads.length });
  }
  setActiveSpread(originalActiveId);
  return captured;
}

// ── Upload: push one captured spread blob ───────────────────────────
async function uploadOneSpread(shareKey, spreadIdx, captured, onProgress) {
  const path = `${shareKey}/spread-${spreadIdx + 1}.${SHARE_EXT}`;
  const startedAt = Date.now();
  console.info(`[Share] uploading spread ${spreadIdx + 1} → ${path} (${(captured.blob.size / 1024).toFixed(0)} KB)…`);
  const { error } = await withTimeout(
    supabase.storage.from(BUCKET).upload(path, captured.blob, {
      contentType: captured.blob.type,
      upsert: true,
      cacheControl: '604800',
    }),
    UPLOAD_TIMEOUT_MS,
    `Upload of spread ${spreadIdx + 1}`,
  );
  if (error) throw new Error(`Upload failed for spread ${spreadIdx + 1}: ${error.message}`);
  console.info(`[Share] spread ${spreadIdx + 1} uploaded in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  onProgress?.(captured.blob.size);
  return {
    id: captured.id,
    role: captured.role,
    w: captured.w,
    h: captured.h,
    imageUrl: publicUrl,
  };
}

async function uploadSpreadsInBatches(shareKey, capturedAll, onProgress) {
  const results = new Array(capturedAll.length);
  let cursor = 0;
  async function worker() {
    while (cursor < capturedAll.length) {
      const i = cursor++;
      results[i] = await uploadOneSpread(shareKey, i, capturedAll[i], onProgress);
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, capturedAll.length) }, worker));
  return results;
}

function newShareKey() {
  return (window.crypto?.randomUUID?.() || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`);
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
// onProgress: ({stage:'capture'|'upload', done, total, bytes}) => void
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

  const spreads = state.spreads || [];
  if (spreads.length === 0) throw new Error('Nothing to share — add a spread first.');

  const shareKey = newShareKey();

  // 1. Render every spread to a Blob in the editor stage.
  const captured = await captureSpreadsForShare({
    stageRef: stage.stageRef,
    spreads,
    setActiveSpread: stage.setActiveSpread,
    originalActiveId: stage.originalActiveId,
    onProgress,
  });

  // 2. Push the blobs to Storage in parallel.
  let bytes = 0;
  let done = 0;
  const uploaded = await uploadSpreadsInBatches(shareKey, captured, (size) => {
    done++;
    bytes += size || 0;
    onProgress?.({ stage: 'upload', done, total: captured.length, bytes });
  });

  // 3. Build the lightweight snapshot. No photos, no template state —
  //    the viewer only needs the spread images and book-level meta.
  const snapshot = {
    bookName: state.bookName,
    spreadSizeId: state.spreadSizeId,
    customSize: state.customSize,
    spreads: uploaded,
  };

  // 4. Insert the row.
  const { data, error } = await supabase.rpc('create_share', {
    p_project_name: state.bookName || 'Untitled',
    p_share_key: shareKey,
    p_snapshot: snapshot,
  });
  if (error) {
    try { await purgeShareFolder(shareKey); } catch { /* ignore */ }
    throw new Error(error.message);
  }
  const token = typeof data === 'string' ? data : data?.[0];
  if (!token) {
    try { await purgeShareFolder(shareKey); } catch { /* ignore */ }
    throw new Error('Failed to create share');
  }
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

export async function getMyShares() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('get_my_shares');
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

// Delete the DB row AND the bucket folder so the share is fully revoked.
export async function deleteShare(token) {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase.rpc('delete_share', { p_token: token });
  if (error) throw new Error(error.message);
  const shareKey = typeof data === 'string' ? data : data?.[0];
  if (shareKey) {
    try { await purgeShareFolder(shareKey); } catch { /* best-effort */ }
  }
}

// List + delete every object inside a share's folder.
async function purgeShareFolder(shareKey) {
  const { data: files, error } = await supabase.storage.from(BUCKET).list(shareKey, { limit: 1000 });
  if (error || !files?.length) return;
  const paths = files.map((f) => `${shareKey}/${f.name}`);
  await supabase.storage.from(BUCKET).remove(paths);
}

export function buildShareUrl(token) {
  return `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(token)}`;
}
