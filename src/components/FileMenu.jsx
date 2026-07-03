import { useState, useEffect, useRef } from 'react';
import { useBookStore } from '../store/useBookStore';
import {
  saveProjectToFile, saveProjectToFileAs,
  openProjectFromFile, readProjectFile,
  subscribeFileHandle, supportsFileSystemAccess,
} from '../utils/projectFile';

// Toolbar entry point for the .autobook Save / Save As / Open workflow.
//
// Shortcuts:
//   ⌘S / Ctrl+S           → Save (writes to the linked file, or prompts if none)
//   ⌘⇧S / Ctrl+Shift+S    → Save As… (always prompts for a location)
//   ⌘O / Ctrl+O           → Open… (loads a .autobook file into the current project)
//
// The button label reflects state: shows the file name when linked, an
// * asterisk when there are unsaved changes, or "Save" as a default.
export default function FileMenu({ t, btnStyle }) {
  const fileDirty = useBookStore((s) => s.fileDirty);
  const loadProject = useBookStore((s) => s.loadProject);
  const [linked, setLinked] = useState({ fileName: null, hasHandle: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState(null); // { kind: 'ok' | 'err', message } | null
  const fallbackInputRef = useRef(null);
  const busyRef = useRef(false);

  useEffect(() => subscribeFileHandle(setLinked), []);

  const flash = (kind, message) => {
    setStatus({ kind, message });
    setTimeout(() => setStatus((s) => (s?.message === message ? null : s)), 4500);
  };

  // Load a parsed { book } payload into the running store. We reuse
  // the existing loadProject action which takes a JSON string, so we
  // just re-stringify the book slice — this keeps a single code path
  // for autosave restore, download-backup restore, and .autobook open.
  const applyOpenedProject = (payload) => {
    if (!payload?.book) throw new Error('Opened file had no project data.');
    loadProject(JSON.stringify(payload.book));
    flash('ok', `Opened ${payload.fileName || 'file'}`);
  };

  const doSave = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await saveProjectToFile();
      if (result?.status === 'cancelled') return;
      if (result?.status === 'saved') {
        flash('ok', `Saved to ${result.fileName} (${(result.bytes / 1024 / 1024).toFixed(1)} MB)`);
      }
    } catch (e) {
      flash('err', e?.message || 'Save failed.');
    } finally {
      busyRef.current = false;
    }
  };

  const doSaveAs = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const result = await saveProjectToFileAs();
      if (result?.status === 'cancelled') return;
      if (result?.status === 'saved') {
        flash('ok', `Saved as ${result.fileName} (${(result.bytes / 1024 / 1024).toFixed(1)} MB)`);
      }
    } catch (e) {
      flash('err', e?.message || 'Save As failed.');
    } finally {
      busyRef.current = false;
    }
  };

  const doOpen = async () => {
    if (busyRef.current) return;
    // Warn on unsaved changes so a click doesn't lose work.
    if (fileDirty
        && !confirm('Open a different file? Any unsaved edits in the current project will be replaced.')) {
      return;
    }
    if (!supportsFileSystemAccess) {
      // Route to <input type=file> for Safari / Firefox.
      fallbackInputRef.current?.click();
      return;
    }
    busyRef.current = true;
    try {
      const result = await openProjectFromFile();
      if (result?.status === 'cancelled') return;
      if (result?.status === 'loaded') applyOpenedProject(result);
    } catch (e) {
      flash('err', e?.message || 'Open failed.');
    } finally {
      busyRef.current = false;
    }
  };

  const onFallbackFilePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = await readProjectFile(file);
      if (result?.status === 'loaded') applyOpenedProject(result);
    } catch (err) {
      flash('err', err?.message || 'Open failed.');
    }
  };

  // Global keyboard shortcuts. Skipped when the user is typing in a
  // form field so ⌘S doesn't hijack browser Save in an input.
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        if (e.shiftKey) doSaveAs();
        else doSave();
        return;
      }
      if (key === 'o') {
        e.preventDefault();
        doOpen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // doSave / doSaveAs / doOpen are stable closures — they don't need
    // to be listed as deps since they read live state via the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileDirty]);

  const label = (() => {
    if (linked.fileName) return `${fileDirty ? '● ' : ''}${linked.fileName}`;
    return fileDirty ? '● Save' : '↓ Save';
  })();

  return (
    <div style={{ position: 'relative' }}>
      <button
        data-tour="file-save"
        onClick={() => setMenuOpen((v) => !v)}
        style={{
          ...btnStyle({
            color: fileDirty ? '#f6c98a' : t.text,
            border: `1px solid ${fileDirty ? '#5a3a10' : t.border}`,
          }),
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={
          linked.fileName
            ? `Save to ${linked.fileName} (⌘S / Ctrl+S)`
            : 'Save this project to a .autobook file on disk (⌘S / Ctrl+S)'
        }
      >
        {label}
      </button>

      <input
        ref={fallbackInputRef}
        type="file"
        accept=".autobook,.photobook,application/json"
        style={{ display: 'none' }}
        onChange={onFallbackFilePicked}
      />

      {menuOpen && (
        <>
          {/* Backdrop swallows outside clicks */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            minWidth: 240, zIndex: 41,
            background: '#141414', border: '1px solid #2a2a2a',
            borderRadius: 6, padding: '4px 0',
            boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}>
            <MenuItem
              onClick={() => { setMenuOpen(false); doSave(); }}
              disabled={!linked.hasHandle && !supportsFileSystemAccess && false}
              label={linked.hasHandle ? `Save to ${linked.fileName}` : 'Save to file…'}
              hint="⌘S / Ctrl+S"
            />
            <MenuItem
              onClick={() => { setMenuOpen(false); doSaveAs(); }}
              label="Save as new file…"
              hint="⌘⇧S / Ctrl+Shift+S"
            />
            <div style={{ height: 1, background: '#252525', margin: '4px 0' }} />
            <MenuItem
              onClick={() => { setMenuOpen(false); doOpen(); }}
              label="Open .autobook file…"
              hint="⌘O / Ctrl+O"
            />
            {!supportsFileSystemAccess && (
              <div style={{
                padding: '6px 12px', fontSize: 10, color: '#666', lineHeight: 1.5,
                borderTop: '1px solid #252525', marginTop: 4,
              }}>
                Your browser doesn't support direct disk writes — Save downloads a fresh copy each time.
                For same-file rewrites use Chrome, Edge, or the desktop app.
              </div>
            )}
          </div>
        </>
      )}

      {/* Toast — flashes success or failure below the button */}
      {status && (
        <div style={{
          position: 'absolute', top: '110%', left: 0, zIndex: 42,
          padding: '6px 10px', minWidth: 220, maxWidth: 360,
          background: status.kind === 'ok' ? '#0e1a10' : '#1a0808',
          border: `1px solid ${status.kind === 'ok' ? '#1e3a20' : '#5a1a1a'}`,
          borderRadius: 5, marginTop: 4,
          fontSize: 11, lineHeight: 1.5,
          color: status.kind === 'ok' ? '#6fcf97' : '#e05c5c',
          boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }}>
          {status.kind === 'ok' ? '✓ ' : '✕ '}{status.message}
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, hint, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '8px 14px',
        background: 'transparent', border: 'none',
        color: disabled ? '#555' : '#ddd',
        fontSize: 12, textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#1e1e1e'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <span>{label}</span>
      <span style={{ fontSize: 10, color: '#666', marginLeft: 12 }}>{hint}</span>
    </button>
  );
}
