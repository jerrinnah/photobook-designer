// Multiple projects per browser, backed by IndexedDB.
// Each project is a full autosave snapshot stored under a UUID key.
// The "active project" pointer is in localStorage so it survives across
// app loads.

import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

const ACTIVE_KEY = 'photobook-active-project-v1';
const PROJECT_PREFIX = 'photobook-project-';
const INDEX_KEY = 'photobook-project-index-v1';

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Index ──────────────────────────────────────────────────────────
// A small array of { id, name, savedAt, photoCount, spreadCount } that
// lets the picker render fast without loading each full project.

export async function getProjectIndex() {
  try {
    const idx = await idbGet(INDEX_KEY);
    return Array.isArray(idx) ? idx : [];
  } catch {
    return [];
  }
}

async function setProjectIndex(idx) {
  try { await idbSet(INDEX_KEY, idx); } catch { /* ignore */ }
}

export async function upsertIndexEntry(entry) {
  const idx = await getProjectIndex();
  const i = idx.findIndex((e) => e.id === entry.id);
  if (i >= 0) idx[i] = { ...idx[i], ...entry };
  else idx.unshift(entry);
  await setProjectIndex(idx);
  return idx;
}

export async function removeIndexEntry(id) {
  const idx = await getProjectIndex();
  await setProjectIndex(idx.filter((e) => e.id !== id));
}

// ── Active project pointer ─────────────────────────────────────────

export function getActiveProjectId() {
  try { return localStorage.getItem(ACTIVE_KEY); }
  catch { return null; }
}

export function setActiveProjectId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch { /* ignore */ }
}

// ── Per-project data ───────────────────────────────────────────────

export async function loadProject(id) {
  if (!id) return null;
  try { return await idbGet(PROJECT_PREFIX + id); }
  catch { return null; }
}

export async function saveProject(id, snapshot) {
  if (!id) return;
  try { await idbSet(PROJECT_PREFIX + id, snapshot); }
  catch { /* ignore */ }
}

export async function deleteProject(id) {
  if (!id) return;
  try { await idbDel(PROJECT_PREFIX + id); } catch { /* ignore */ }
  await removeIndexEntry(id);
}

export async function duplicateProject(id, newName) {
  const src = await loadProject(id);
  if (!src) return null;
  const newProjectId = newId();
  const snap = { ...src, savedAt: Date.now(), bookName: newName || `${src.bookName || 'photobook'} copy` };
  await saveProject(newProjectId, snap);
  await upsertIndexEntry({
    id: newProjectId,
    name: snap.bookName,
    savedAt: snap.savedAt,
    photoCount: (snap.photos || []).length,
    spreadCount: (snap.spreads || []).length,
  });
  return newProjectId;
}

export async function createProject(name = 'Untitled photobook') {
  const id = newId();
  await upsertIndexEntry({
    id, name, savedAt: Date.now(),
    photoCount: 0, spreadCount: 3,
  });
  return id;
}

// ── Migration ──────────────────────────────────────────────────────
// On first run after this feature ships, take whatever the legacy
// single-project autosave has and turn it into the user's first
// project so nothing is lost.

const MIGRATED_KEY = 'photobook-projects-migrated-v1';

export async function migrateLegacyAutosave() {
  if (localStorage.getItem(MIGRATED_KEY)) return; // already migrated
  try {
    const legacy = await idbGet('photobook-autosave-v2');
    if (legacy && (legacy.spreads?.length || legacy.photos?.length)) {
      const id = newId();
      const name = legacy.bookName || 'My first photobook';
      await saveProject(id, { ...legacy, bookName: name });
      await upsertIndexEntry({
        id, name, savedAt: legacy.savedAt || Date.now(),
        photoCount: (legacy.photos || []).length,
        spreadCount: (legacy.spreads || []).length,
      });
      setActiveProjectId(id);
    }
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch { /* ignore */ }
}

// Find all orphan project blobs in IDB (blobs whose ID isn't in the index)
// — useful for debug + cleanup later. Not used by the UI yet.
export async function findOrphanProjectIds() {
  try {
    const allKeys = await idbKeys();
    const projectIds = allKeys
      .filter((k) => typeof k === 'string' && k.startsWith(PROJECT_PREFIX))
      .map((k) => k.slice(PROJECT_PREFIX.length));
    const idx = await getProjectIndex();
    const indexed = new Set(idx.map((e) => e.id));
    return projectIds.filter((id) => !indexed.has(id));
  } catch {
    return [];
  }
}
