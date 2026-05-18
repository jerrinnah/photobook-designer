// Client proofing / share-for-review utilities.
// Generates an unguessable share token and downscales photos before
// uploading the snapshot to Supabase.

import { supabase, isSupabaseConfigured, getStoredUser } from './supabase';
import { getEffectiveTier } from './premium';

const SHARE_PHOTO_MAX_DIM = 1400; // downscale aggressively for share previews
const SHARE_JPEG_QUALITY = 0.85;
const MAX_SHARE_BYTES = 7_500_000; // hard cap to keep Supabase row size sane

// Resize a data URL down to SHARE_PHOTO_MAX_DIM on the longest edge.
function downscaleForShare(dataURL) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const maxSide = Math.max(img.width, img.height);
      if (maxSide <= SHARE_PHOTO_MAX_DIM) return resolve(dataURL);
      const scale = SHARE_PHOTO_MAX_DIM / maxSide;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const isPng = dataURL.startsWith('data:image/png');
      resolve(isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', SHARE_JPEG_QUALITY));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

// Build a slim snapshot of the project — drop originals, downscale display
// photos. Returns the snapshot + an approximate byte size.
async function buildShareSnapshot(state) {
  const photos = await Promise.all((state.photos || []).map(async (p) => ({
    id: p.id,
    name: p.name,
    width: p.width,
    height: p.height,
    src: await downscaleForShare(p.src),
    // intentionally NOT including originalSrc — share previews don't need print res
  })));

  const snapshot = {
    bookName: state.bookName,
    spreadSizeId: state.spreadSizeId,
    customSize: state.customSize,
    gap: state.gap,
    blendEdges: state.blendEdges,
    spreads: state.spreads,
    photos,
  };

  // Approximate byte size
  let bytes = 0;
  for (const p of photos) bytes += p.src?.length || 0;

  return { snapshot, bytes };
}

export async function createShare(state) {
  const user = getStoredUser();
  if (!user?.id) throw new Error('Sign in first.');
  if (getEffectiveTier(user) === 'free') throw new Error('Premium or active trial required to share for review.');
  if (!isSupabaseConfigured) throw new Error('Backend not configured.');

  const { snapshot, bytes } = await buildShareSnapshot(state);
  if (bytes > MAX_SHARE_BYTES) {
    throw new Error(
      `Project is too large to share (~${(bytes / 1_000_000).toFixed(1)} MB). ` +
      `Try removing some photos or splitting into smaller projects.`
    );
  }

  const { data, error } = await supabase.rpc('create_share', {
    p_user_id: user.id,
    p_project_name: state.bookName || 'Untitled',
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

export async function getMyShares() {
  const user = getStoredUser();
  if (!user?.id || !isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('get_my_shares', { p_user_id: user.id });
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

export async function deleteShare(token) {
  const user = getStoredUser();
  if (!user?.id || !isSupabaseConfigured) return;
  await supabase.rpc('delete_share', { p_user_id: user.id, p_token: token });
}

export function buildShareUrl(token) {
  return `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(token)}`;
}
