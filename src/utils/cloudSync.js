// Cloud project sync — mirrors each project to a per-user file in
// Supabase Storage so users can pick up on a different device or
// recover from a wiped browser.
//
// Storage layout (Supabase bucket 'project-backups', private + RLS):
//   {user_id}/{project_id}.autobook
//
// The file is exactly the .autobook envelope defined in projectFile.js
// — same format, one canonical serialization.
//
// Push cadence:
//   • 60s debounce during editing (piggybacks the store subscribe)
//   • Explicit push on every Save-to-file / Save-As
//   • Explicit push on beforeunload
//
// Pull cadence:
//   • On app boot, we list every remote project and compare the
//     `savedAt` timestamp against the local one. If remote is newer,
//     the user gets a confirm prompt: "This project has a newer version
//     saved on another device. Load it?" Yes → download + replace.
//
// SETUP NOTE FOR THE OWNER:
//   You must create a private bucket named 'project-backups' in
//   Supabase → Storage. See SUPABASE_CLOUD_SYNC.sql for the RLS
//   policies that let each user read/write only their own folder.
//   Without both pieces, this module silently degrades to no-op.

import { supabase, isSupabaseConfigured, getStoredUser } from './supabase';
import { buildAutobookPayload, parseAutobookPayload } from './projectFile';
import { getActiveProjectId, getProjectIndex, saveProject as saveProjectBlob, upsertIndexEntry } from '../store/projects';

const BUCKET = 'project-backups';
const DEBOUNCE_MS = 60_000;

let _debounceTimer = null;
let _syncing = false;
let _listeners = new Set();
let _lastStatus = { state: 'idle' }; // { state: 'idle'|'pushing'|'pushed'|'error', at?, message? }

function notify(patch) {
  _lastStatus = { ...patch, at: Date.now() };
  for (const fn of _listeners) { try { fn(_lastStatus); } catch { /* ignore */ } }
}

export function subscribeCloudSyncStatus(fn) {
  _listeners.add(fn);
  fn(_lastStatus);
  return () => _listeners.delete(fn);
}

export function getCloudSyncStatus() { return _lastStatus; }

function objectPath(userId, projectId) {
  return `${userId}/${projectId}.autobook`;
}

async function requireUserId() {
  const u = getStoredUser();
  return u?.id || null;
}

// Push the active project to the cloud. Silent no-op when the user
// isn't signed in / bucket doesn't exist / project isn't open.
export async function pushActiveProject() {
  if (!isSupabaseConfigured) return { status: 'unavailable' };
  const userId = await requireUserId();
  if (!userId) return { status: 'unauthenticated' };
  const projectId = getActiveProjectId();
  if (!projectId) return { status: 'no-project' };
  if (_syncing) return { status: 'busy' };
  _syncing = true;
  notify({ state: 'pushing' });
  try {
    // Lazy import so the store isn't referenced during module init.
    const { useBookStore } = await import('../store/useBookStore');
    const state = useBookStore.getState();
    const payload = buildAutobookPayload(state);
    const path = objectPath(userId, projectId);
    const blob = new Blob([payload], { type: 'application/x-autobook+json' });
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'application/x-autobook+json',
      cacheControl: '0',
    });
    if (error) throw error;
    notify({ state: 'pushed', message: `Saved to cloud · ${(payload.length / 1024 / 1024).toFixed(1)} MB` });
    return { status: 'ok', bytes: payload.length };
  } catch (e) {
    // Bucket missing / policy denies / network — non-fatal. The local
    // autosave still holds the project.
    console.info('[cloudSync] push failed:', e?.message);
    notify({ state: 'error', message: e?.message || 'Cloud save failed' });
    return { status: 'error', error: e };
  } finally {
    _syncing = false;
  }
}

// Debounced push — hooked into the store subscription in startCloudSync.
function schedulePush() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    pushActiveProject();
  }, DEBOUNCE_MS);
}

// Pull the remote copy of a project into local IndexedDB. Overwrites
// the local blob; used after the user opts in to "load the newer
// version from another device".
export async function pullRemoteProject(projectId) {
  if (!isSupabaseConfigured) return { status: 'unavailable' };
  const userId = await requireUserId();
  if (!userId) return { status: 'unauthenticated' };
  try {
    const path = objectPath(userId, projectId);
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) throw error;
    const text = await data.text();
    const parsed = parseAutobookPayload(text);
    await saveProjectBlob(projectId, parsed.book);
    await upsertIndexEntry({
      id: projectId,
      name: parsed.book.bookName || 'Untitled',
      savedAt: Date.parse(parsed.envelope?.savedAt || '') || Date.now(),
      photoCount: (parsed.book.photos || []).length,
      spreadCount: (parsed.book.spreads || []).length,
    });
    return { status: 'ok', book: parsed.book, envelope: parsed.envelope };
  } catch (e) {
    console.info('[cloudSync] pull failed:', e?.message);
    return { status: 'error', error: e };
  }
}

// On boot, compare timestamps. If any project has a newer copy in the
// cloud (typical when the user was working on another device), we
// surface an offer to pull it. Returns an array of newer-remote entries.
export async function findNewerRemote() {
  if (!isSupabaseConfigured) return [];
  const userId = await requireUserId();
  if (!userId) return [];
  try {
    const { data: files, error } = await supabase.storage.from(BUCKET).list(userId, {
      limit: 200,
      sortBy: { column: 'updated_at', order: 'desc' },
    });
    if (error) throw error;
    const local = await getProjectIndex();
    const localById = new Map(local.map((p) => [p.id, p]));
    const newer = [];
    for (const f of files || []) {
      const match = f.name?.match(/^([^/]+)\.autobook$/);
      if (!match) continue;
      const projectId = match[1];
      const localEntry = localById.get(projectId);
      const remoteAt = f.updated_at ? Date.parse(f.updated_at) : 0;
      if (!localEntry) {
        // Fully new — never seen locally.
        newer.push({ projectId, remoteAt, name: null, reason: 'missing-local' });
      } else if (remoteAt > (localEntry.savedAt || 0) + 5_000) {
        // 5s slack — clocks can drift a few seconds.
        newer.push({ projectId, remoteAt, name: localEntry.name, reason: 'newer-remote' });
      }
    }
    return newer;
  } catch (e) {
    console.info('[cloudSync] list failed:', e?.message);
    return [];
  }
}

// Wire the debounced push into the store. Call once from main.jsx.
export function startCloudSync(store) {
  const unsub = store.subscribe((s, prev) => {
    if (
      s.spreads !== prev.spreads ||
      s.photos !== prev.photos ||
      s.bookName !== prev.bookName ||
      s.spreadSizeId !== prev.spreadSizeId ||
      s.customSize !== prev.customSize ||
      s.gap !== prev.gap ||
      s.blendEdges !== prev.blendEdges
    ) schedulePush();
  });
  const onBeforeUnload = () => {
    if (_debounceTimer) {
      clearTimeout(_debounceTimer);
      _debounceTimer = null;
      // Fire-and-forget synchronous best effort. The browser may kill
      // the request; the next boot's findNewerRemote handles the rest.
      pushActiveProject();
    }
  };
  window.addEventListener('beforeunload', onBeforeUnload);
  return () => {
    unsub();
    window.removeEventListener('beforeunload', onBeforeUnload);
    if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
  };
}
