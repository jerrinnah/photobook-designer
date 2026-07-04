// Local version history — periodic timestamped snapshots stored in
// IndexedDB per project.
//
// The main autosave (autosave.js) writes the *current* state to a
// single key; if a change corrupts the project between autosaves, the
// user still loses everything since the last save-to-file. This module
// adds a rolling history: every SNAPSHOT_INTERVAL_MS a new snapshot
// entry is written, up to MAX_SNAPSHOTS. Old snapshots are pruned
// automatically. Users can browse them in the Projects modal and
// restore any one.
//
// Storage shape (idb-keyval):
//   `${INDEX_KEY_PREFIX}${projectId}` → [{ id, savedAt, bytes, spreadCount, photoCount }, ...]
//   `${SNAP_KEY_PREFIX}${projectId}:${snapshotId}` → the full project snapshot
//
// Bounded storage: history is roughly SNAP_COUNT × avg_project_size,
// but each snapshot shares the same base64 photo strings via structured
// clone, so the browser tends to dedupe under the hood. Even a
// worst-case ~10 snapshots × 200 MB is well within IndexedDB quota.

import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';

const INDEX_KEY_PREFIX = 'autobook-history-index:';
const SNAP_KEY_PREFIX = 'autobook-history-snap:';
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // one snapshot per 5 minutes of active work
const MAX_SNAPSHOTS = 12;

let _timer = null;
let _lastSnapshotAt = 0;
let _lastSnapshotSig = null; // { spreads, photos } identity check to skip no-op snapshots

const indexKey = (projectId) => `${INDEX_KEY_PREFIX}${projectId}`;
const snapKey = (projectId, snapshotId) => `${SNAP_KEY_PREFIX}${projectId}:${snapshotId}`;

function buildSnapshot(state) {
  return {
    v: 1,
    bookName: state.bookName,
    spreadSizeId: state.spreadSizeId,
    customSize: state.customSize,
    gap: state.gap,
    blendEdges: state.blendEdges,
    spreads: state.spreads,
    photos: state.photos,
  };
}

function estimateBytes(snapshot) {
  let n = 0;
  for (const p of snapshot.photos || []) {
    n += (p.src?.length || 0) + (p.originalSrc?.length || 0);
  }
  return n;
}

// Public API ─────────────────────────────────────────────────────────

export async function listSnapshots(projectId) {
  if (!projectId) return [];
  try {
    return (await idbGet(indexKey(projectId))) || [];
  } catch { return []; }
}

export async function loadSnapshot(projectId, snapshotId) {
  if (!projectId || !snapshotId) return null;
  try {
    return await idbGet(snapKey(projectId, snapshotId));
  } catch { return null; }
}

async function pruneOldSnapshots(projectId, index) {
  const keep = index.slice(0, MAX_SNAPSHOTS);
  const drop = index.slice(MAX_SNAPSHOTS);
  await Promise.all(drop.map((entry) => idbDel(snapKey(projectId, entry.id)).catch(() => {})));
  return keep;
}

async function writeSnapshot(projectId, state) {
  const snap = buildSnapshot(state);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry = {
    id,
    savedAt: Date.now(),
    bytes: estimateBytes(snap),
    spreadCount: (snap.spreads || []).length,
    photoCount: (snap.photos || []).length,
  };
  try {
    await idbSet(snapKey(projectId, id), snap);
    const existing = (await idbGet(indexKey(projectId))) || [];
    const next = await pruneOldSnapshots(projectId, [entry, ...existing]);
    await idbSet(indexKey(projectId), next);
  } catch (e) {
    // Quota exceeded or IDB write failed — the storage-quota banner
    // already warns the user; nothing else useful to do here.
    console.info('[history] snapshot skipped:', e?.message);
  }
}

// Start the timer that periodically snapshots the store's state.
// Returns an unsubscribe.
export function startHistoryRecording(store, getProjectId) {
  const tick = async () => {
    const projectId = getProjectId();
    if (!projectId) return; // no active project — skip
    const s = store.getState();
    const sig = { spreads: s.spreads, photos: s.photos };
    if (_lastSnapshotSig
        && _lastSnapshotSig.spreads === sig.spreads
        && _lastSnapshotSig.photos === sig.photos) return;
    _lastSnapshotSig = sig;
    _lastSnapshotAt = Date.now();
    await writeSnapshot(projectId, s);
  };
  _timer = setInterval(tick, SNAPSHOT_INTERVAL_MS);
  return () => {
    if (_timer) { clearInterval(_timer); _timer = null; }
  };
}

// Force-write a snapshot right now — called on major actions like
// "Save to file" and before an export runs. Skipped if the last snapshot
// was < 30s ago so rapid clicks don't burn history slots.
export async function snapshotNow(projectId, state) {
  if (!projectId) return;
  if (Date.now() - _lastSnapshotAt < 30_000) return;
  _lastSnapshotAt = Date.now();
  await writeSnapshot(projectId, state);
}

// Delete every snapshot for a project (used when the project is
// deleted from the Projects modal).
export async function clearProjectHistory(projectId) {
  if (!projectId) return;
  try {
    const index = (await idbGet(indexKey(projectId))) || [];
    await Promise.all(index.map((entry) => idbDel(snapKey(projectId, entry.id)).catch(() => {})));
    await idbDel(indexKey(projectId));
  } catch { /* ignore */ }
}
