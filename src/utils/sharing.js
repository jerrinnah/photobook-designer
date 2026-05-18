// Client proofing / share-for-review utilities.
//
// Photos are uploaded to the public `share-previews` Supabase Storage
// bucket; the DB row only carries the URLs. This means a share works
// for projects of any size — the snapshot stays a few KB regardless of
// how many photos.

import { supabase, isSupabaseConfigured, getStoredUser } from './supabase';
import { getEffectiveTier } from './premium';

const BUCKET = 'share-previews';
const SHARE_PHOTO_MAX_DIM = 1400; // long-edge downscale for share previews
const SHARE_JPEG_QUALITY = 0.85;
const UPLOAD_CONCURRENCY = 8;     // parallelism when pushing photos to Storage

// Resize a data URL down to SHARE_PHOTO_MAX_DIM on the longest edge.
// Returns a Blob (which Supabase Storage uploads directly without
// the overhead of re-encoding through fetch()).
function downscaleForShare(dataURL) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const maxSide = Math.max(img.width, img.height);
      const scale = maxSide > SHARE_PHOTO_MAX_DIM ? SHARE_PHOTO_MAX_DIM / maxSide : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const isPng = dataURL.startsWith('data:image/png');
      const mime = isPng ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        (blob) => resolve(blob),
        mime,
        isPng ? undefined : SHARE_JPEG_QUALITY,
      );
    };
    img.onerror = () => resolve(null);
    img.src = dataURL;
  });
}

// Upload one photo to the share-previews bucket, return its public URL.
async function uploadOne(shareKey, photo, onProgress) {
  const blob = await downscaleForShare(photo.src);
  if (!blob) throw new Error(`Couldn't process photo "${photo.name}"`);
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${shareKey}/${photo.id}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: true,
    cacheControl: '604800', // 7 days CDN cache
  });
  if (error) throw new Error(`Upload failed for "${photo.name}": ${error.message}`);
  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
  onProgress?.();
  return { id: photo.id, name: photo.name, width: photo.width, height: photo.height, src: publicUrl };
}

// Upload photos in small parallel batches.
async function uploadPhotosInBatches(shareKey, photos, onProgress) {
  const results = new Array(photos.length);
  let cursor = 0;
  async function worker() {
    while (cursor < photos.length) {
      const i = cursor++;
      results[i] = await uploadOne(shareKey, photos[i], onProgress);
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, photos.length) }, worker));
  return results;
}

// Generate an unguessable folder name for this share's photos.
// crypto.randomUUID is available in every browser we ship to.
function newShareKey() {
  return (window.crypto?.randomUUID?.() || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

export async function createShare(state, onProgress) {
  const user = getStoredUser();
  if (!user?.id) throw new Error('Sign in first.');
  if (getEffectiveTier(user) === 'free') throw new Error('Paid plan or active trial required to share for review.');
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');

  const photos = state.photos || [];
  const shareKey = newShareKey();

  // 1) Upload every photo to Storage and collect the URLs.
  let done = 0;
  const total = photos.length;
  const uploadedPhotos = await uploadPhotosInBatches(shareKey, photos, () => {
    done++;
    onProgress?.({ done, total });
  });

  // 2) Build a lightweight snapshot — URLs, not base64.
  const snapshot = {
    bookName: state.bookName,
    spreadSizeId: state.spreadSizeId,
    customSize: state.customSize,
    gap: state.gap,
    blendEdges: state.blendEdges,
    spreads: state.spreads,
    photos: uploadedPhotos,
  };

  // 3) Create the DB row referencing this shareKey folder.
  // RPC uses auth.uid() to find the public.users row (so it works even
  // when the cached profile carries the session-fallback UUID).
  const { data, error } = await supabase.rpc('create_share', {
    p_project_name: state.bookName || 'Untitled',
    p_share_key: shareKey,
    p_snapshot: snapshot,
  });
  if (error) {
    // RPC failed — try to clean up the orphan bucket folder so we don't leak Storage
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
