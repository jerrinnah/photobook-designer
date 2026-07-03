// .autobook file format — portable, versioned save file.
//
// Envelope structure (JSON):
//   {
//     "magic":         "autobook.project",       // identifier — reject files without this
//     "formatVersion": 1,                        // schema version — bump when we change the shape
//     "app":           { "name": "AutoBook by NEJ", "version": "1.0.0" },
//     "savedAt":       "2026-07-03T15:30:00.000Z",
//     "savedBy":       "user@example.com" | null,
//     "book": {                                  // whatever the store needs to fully restore a project
//       "bookName":     "...",
//       "spreadSizeId": "...",
//       "customSize":   { ... } | null,
//       "gap":          8,
//       "blendEdges":   false,
//       "spreads":      [ ... ],
//       "photos":       [ ... ]
//     }
//   }
//
// Backward compat: files written by the older Download-Backup path used
// the bare project object directly (no envelope). loadProjectFile()
// detects and unwraps both shapes transparently.

import { useBookStore } from '../store/useBookStore';
import { getStoredUser } from './supabase';

export const AUTOBOOK_MAGIC = 'autobook.project';
export const AUTOBOOK_FORMAT_VERSION = 1;
export const AUTOBOOK_EXTENSION = '.autobook';
export const AUTOBOOK_MIME = 'application/x-autobook+json';

// File System Access API is on Chrome, Edge, Opera desktop + Electron.
// Safari and Firefox fall back to the download / <input type=file> path.
export const supportsFileSystemAccess =
  typeof window !== 'undefined'
  && typeof window.showSaveFilePicker === 'function'
  && typeof window.showOpenFilePicker === 'function';

function currentUserEmail() {
  try { return getStoredUser()?.email || null; } catch { return null; }
}

// Envelope the current store state into a .autobook payload string.
// Kept synchronous — the caller wraps it in a try/catch because
// JSON.stringify can throw RangeError on very large projects.
export function buildAutobookPayload(state) {
  const envelope = {
    magic: AUTOBOOK_MAGIC,
    formatVersion: AUTOBOOK_FORMAT_VERSION,
    app: { name: 'AutoBook by NEJ', version: '1.0.0' },
    savedAt: new Date().toISOString(),
    savedBy: currentUserEmail(),
    book: {
      bookName: state.bookName,
      spreadSizeId: state.spreadSizeId,
      customSize: state.customSize,
      gap: state.gap,
      blendEdges: state.blendEdges,
      spreads: state.spreads,
      photos: state.photos,
    },
  };
  return JSON.stringify(envelope);
}

// Parse a .autobook file's text back into the store-consumable shape.
// Accepts:
//   - New envelope shape (this format)
//   - Legacy bare project JSON (v1 or v2 from Download-Backup)
// Throws on anything that doesn't look like a project.
export function parseAutobookPayload(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`This doesn't look like a valid .autobook file — ${e?.message || 'JSON parse failed'}.`);
  }
  if (data && typeof data === 'object' && data.magic === AUTOBOOK_MAGIC) {
    if (!data.book) throw new Error('The file is missing project data.');
    return {
      envelope: {
        formatVersion: data.formatVersion,
        savedAt: data.savedAt,
        savedBy: data.savedBy,
        app: data.app,
      },
      book: data.book,
    };
  }
  // Backward-compat with the pre-envelope Download-Backup format.
  if (data && typeof data === 'object' && (data.spreads || data.photos)) {
    return {
      envelope: null,
      book: {
        bookName: data.bookName,
        spreadSizeId: data.spreadSizeId,
        customSize: data.customSize,
        gap: data.gap,
        blendEdges: data.blendEdges,
        spreads: data.spreads,
        photos: data.photos,
      },
    };
  }
  throw new Error("This file isn't in a format AutoBook recognizes.");
}

// In-memory handle for the current project's linked disk file. Not
// persisted — File System Access handles can't be serialized to JSON
// (they can be stashed in IndexedDB but we keep it simple for now).
// Losing the handle only means the next ⌘S falls back to Save As.
let _fileHandle = null;
let _fileName = null;
const _handleListeners = new Set();

function notifyHandleChanged() {
  for (const fn of _handleListeners) {
    try { fn({ fileName: _fileName, hasHandle: Boolean(_fileHandle) }); } catch { /* ignore */ }
  }
}

export function subscribeFileHandle(fn) {
  _handleListeners.add(fn);
  fn({ fileName: _fileName, hasHandle: Boolean(_fileHandle) });
  return () => _handleListeners.delete(fn);
}

export function getLinkedFileName() {
  return _fileName;
}

export function hasLinkedFile() {
  return Boolean(_fileHandle);
}

function suggestedFileName(bookName) {
  const slug = (bookName || 'photobook')
    .replace(/[^a-z0-9\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase() || 'photobook';
  return `${slug}${AUTOBOOK_EXTENSION}`;
}

// Common entry: "Save to file". Uses the remembered handle if the
// user has one, otherwise routes to Save As.
export async function saveProjectToFile() {
  const state = useBookStore.getState();
  if (supportsFileSystemAccess && _fileHandle) {
    return writeToHandle(_fileHandle, state);
  }
  return saveProjectToFileAs();
}

// "Save As" — always prompts. On File System Access browsers this
// yields a handle we cache so subsequent ⌘S writes back to the same
// file. On Safari / Firefox it falls back to a blob download.
export async function saveProjectToFileAs() {
  const state = useBookStore.getState();
  const suggested = suggestedFileName(state.bookName);
  if (supportsFileSystemAccess) {
    let handle;
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types: [{
          description: 'AutoBook project',
          accept: { [AUTOBOOK_MIME]: [AUTOBOOK_EXTENSION] },
        }],
      });
    } catch (e) {
      if (e?.name === 'AbortError') return { status: 'cancelled' };
      throw e;
    }
    const result = await writeToHandle(handle, state);
    _fileHandle = handle;
    _fileName = handle.name || suggested;
    notifyHandleChanged();
    return result;
  }
  return downloadFallback(state, suggested);
}

async function writeToHandle(handle, state) {
  const payload = buildAutobookPayload(state);
  const bytes = payload.length;
  let writable;
  try {
    writable = await handle.createWritable();
  } catch (e) {
    if (e?.name === 'NotAllowedError') {
      // Permission expired — force a re-pick.
      _fileHandle = null;
      _fileName = null;
      notifyHandleChanged();
      throw new Error(
        `Permission to write to that file expired. Choose "Save As" and pick the file again to relink it.`
      );
    }
    throw new Error(`Couldn't open the file for writing: ${e?.message || e?.name || 'unknown error'}.`);
  }
  try {
    await writable.write(payload);
    await writable.close();
  } catch (e) {
    throw new Error(`Couldn't write the file: ${e?.message || e?.name || 'unknown error'}.`);
  }
  useBookStore.getState().markProjectSaved?.();
  return {
    status: 'saved',
    bytes,
    fileName: handle.name || _fileName || 'photobook.autobook',
  };
}

function downloadFallback(state, filename) {
  const payload = buildAutobookPayload(state);
  const bytes = payload.length;
  const blob = new Blob([payload], { type: AUTOBOOK_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Chrome needs a moment to fetch the blob before we revoke.
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 4000);
  useBookStore.getState().markProjectSaved?.();
  return { status: 'saved', bytes, fileName: filename };
}

// "Open from file" — reads a file into a { envelope, book } record.
// Caller decides what to do with it (usually loadProject into the
// active project OR create a new project).
export async function openProjectFromFile() {
  if (supportsFileSystemAccess) {
    let handle;
    try {
      const [h] = await window.showOpenFilePicker({
        multiple: false,
        types: [{
          description: 'AutoBook project',
          accept: {
            [AUTOBOOK_MIME]: [AUTOBOOK_EXTENSION],
            'application/json': ['.photobook', '.json'],
          },
        }],
      });
      handle = h;
    } catch (e) {
      if (e?.name === 'AbortError') return { status: 'cancelled' };
      throw e;
    }
    const file = await handle.getFile();
    const text = await file.text();
    const parsed = parseAutobookPayload(text);
    // Remember the handle so a subsequent ⌘S rewrites to the same file.
    _fileHandle = handle;
    _fileName = handle.name || file.name || null;
    notifyHandleChanged();
    return { status: 'loaded', ...parsed, fileName: _fileName };
  }
  return { status: 'needs-input-fallback' };
}

// For the non-File-System-Access path — call from an <input type=file>
// onChange after the user picks a file.
export async function readProjectFile(file) {
  if (!file) throw new Error('No file selected.');
  const text = await file.text();
  const parsed = parseAutobookPayload(text);
  // No handle available in the fallback path — Save will download a new
  // file rather than rewrite. That's expected on Safari / Firefox.
  _fileHandle = null;
  _fileName = file.name || null;
  notifyHandleChanged();
  return { status: 'loaded', ...parsed, fileName: _fileName };
}

// Explicit "unlink" — user chose "New" or opened a project from the
// browser library, and we want ⌘S to Save As from scratch.
export function clearLinkedFile() {
  _fileHandle = null;
  _fileName = null;
  notifyHandleChanged();
}
