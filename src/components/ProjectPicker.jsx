import { useState, useEffect, useRef } from 'react';
import {
  getProjectIndex, createProject, deleteProject, duplicateProject,
  setActiveProjectId, getActiveProjectId, saveProject,
} from '../store/projects';
import { listSnapshots, loadSnapshot } from '../store/history';
import { useBookStore } from '../store/useBookStore';

// "My Projects" modal — lists every project saved in this browser.
// Click to switch (reloads the app). Plus / Duplicate / Delete actions.
// Backup section at the bottom handles .photobook file export / import.
export default function ProjectPicker({ open, onClose, onSaveBackup, onLoadBackup }) {
  const [projects, setProjects] = useState([]);
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [newName, setNewName] = useState('');
  const [backupState, setBackupState] = useState({ status: 'idle' }); // 'idle' | 'saving' | 'done' | 'error'
  const [snapshots, setSnapshots] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const activeId = getActiveProjectId();
  const fileInputRef = useRef(null);

  const handleBackupClick = async () => {
    if (!onSaveBackup) return;
    if (backupState.status === 'saving') return; // already running
    setBackupState({ status: 'saving' });
    try {
      const result = await onSaveBackup();
      const bytes = result?.bytes;
      setBackupState({
        status: 'done',
        message: bytes
          ? `Backup saved (${(bytes / 1024 / 1024).toFixed(1)} MB). Check your Downloads folder.`
          : 'Backup saved. Check your Downloads folder.',
      });
      // Auto-clear the "done" chip after 6s so the modal doesn't get stale
      setTimeout(() => setBackupState((s) => (s.status === 'done' ? { status: 'idle' } : s)), 6000);
    } catch (e) {
      setBackupState({
        status: 'error',
        message: e?.message || 'Backup failed. Please try again.',
      });
    }
  };

  const handleRestoreClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onLoadBackup?.(ev.target.result);
      onClose();
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const refresh = async () => {
    const idx = await getProjectIndex();
    setProjects(idx.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)));
    if (activeId) {
      setSnapshots(await listSnapshots(activeId));
    } else {
      setSnapshots([]);
    }
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  const restoreSnapshot = async (snapshotId, savedAt) => {
    if (!activeId || historyBusy) return;
    const stamp = new Date(savedAt).toLocaleString();
    if (!confirm(`Restore your project to the version from ${stamp}? The current state will be replaced (but is safe in the most recent auto-snapshot).`)) return;
    setHistoryBusy(true);
    try {
      const snap = await loadSnapshot(activeId, snapshotId);
      if (!snap) throw new Error('That version could not be loaded.');
      // Re-use the store's loadProject which accepts a JSON string and
      // normalizes photo IDs / caption IDs / dup photos.
      useBookStore.getState().loadProject(JSON.stringify(snap));
      onClose();
    } catch (e) {
      alert(e.message || 'Restore failed.');
    } finally {
      setHistoryBusy(false);
    }
  };

  if (!open) return null;

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled photobook';
    const id = await createProject(name);
    // Seed the project blob with the bookName so the editor opens with
    // the right name in the toolbar (project name = book name, single
    // source of truth). The autosave will fill in the rest of the
    // state on first interaction.
    await saveProject(id, { bookName: name, savedAt: Date.now() });
    setActiveProjectId(id);
    window.location.reload();
  };

  const handleOpen = (id) => {
    if (id === activeId) { onClose(); return; }
    setActiveProjectId(id);
    window.location.reload();
  };

  const handleDelete = async (proj) => {
    if (!confirm(`Delete "${proj.name}"? This cannot be undone.`)) return;
    await deleteProject(proj.id);
    // Also wipe its version-history entries to reclaim storage.
    try {
      const { clearProjectHistory } = await import('../store/history');
      await clearProjectHistory(proj.id);
    } catch { /* non-fatal */ }
    if (proj.id === activeId) {
      // We just deleted the active project — go to a fresh project
      setActiveProjectId(null);
      window.location.reload();
    } else {
      refresh();
    }
  };

  const handleDuplicate = async (proj) => {
    const copyName = `${proj.name} copy`;
    const newId = await duplicateProject(proj.id, copyName);
    if (newId) refresh();
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: '#111', border: '1px solid #1f1f1f',
        borderRadius: 10, padding: '20px 24px',
        width: 540, maxWidth: '94vw',
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
        color: '#e0e0e0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#e8e8e8' }}>My Projects</div>
          <button onClick={onClose} style={btnGhost}>✕</button>
        </div>

        {/* Create new */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="New project name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            style={{
              flex: 1, padding: '9px 12px',
              background: '#181818', border: '1px solid #252525',
              borderRadius: 5, color: '#ddd', fontSize: 13, outline: 'none',
            }}
          />
          <button onClick={handleCreate} style={btnPrimary}>+ Create</button>
        </div>

        {/* Project list */}
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: 8 }}>
          {projects.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: '#555', fontSize: 12 }}>
              No saved projects yet. Click + Create to start your first one.
            </div>
          ) : projects.map((p) => (
            <div key={p.id} style={{
              padding: '10px 12px',
              background: p.id === activeId ? '#1a2535' : '#161616',
              border: `1px solid ${p.id === activeId ? '#2c4070' : '#1f1f1f'}`,
              borderRadius: 6,
              marginBottom: 6,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div onClick={() => handleOpen(p.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: p.id === activeId ? '#bcd' : '#ddd', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.name}
                  {p.id === activeId && <span style={{ fontSize: 9, color: '#4f8ef7', letterSpacing: 0.5 }}>OPEN</span>}
                </div>
                <div style={{ fontSize: 10, color: '#666', marginTop: 3 }}>
                  {p.photoCount ?? 0} photo{(p.photoCount ?? 0) === 1 ? '' : 's'} ·{' '}
                  {p.spreadCount ?? 0} spread{(p.spreadCount ?? 0) === 1 ? '' : 's'} ·{' '}
                  Updated {formatDate(p.savedAt)}
                </div>
              </div>
              <button onClick={() => handleDuplicate(p)} title="Duplicate" style={iconBtn}>⊞</button>
              <button onClick={() => handleDelete(p)} title="Delete" style={{ ...iconBtn, color: '#e05c5c' }}>✕</button>
            </div>
          ))}
        </div>

        {/* Version history — periodic snapshots of the active project */}
        {activeId && (
          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 12, marginTop: 4 }}>
            <button
              onClick={() => setHistoryOpen((v) => !v)}
              style={{
                background: 'none', border: 'none', color: '#666',
                fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase',
                marginBottom: 8, padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 9, color: '#555' }}>{historyOpen ? '▾' : '▸'}</span>
              Version history ({snapshots.length})
            </button>
            {historyOpen && (
              snapshots.length === 0 ? (
                <div style={{ fontSize: 10, color: '#555', paddingBottom: 8 }}>
                  No snapshots yet. One is captured automatically every 5 minutes of active work.
                </div>
              ) : (
                <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 8 }}>
                  {snapshots.map((snap) => (
                    <div key={snap.id} style={{
                      padding: '6px 8px', marginBottom: 4,
                      background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 4,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: '#ccc' }}>{formatDate(snap.savedAt)}</div>
                        <div style={{ fontSize: 9, color: '#666', marginTop: 1 }}>
                          {snap.photoCount} photo{snap.photoCount === 1 ? '' : 's'} ·{' '}
                          {snap.spreadCount} spread{snap.spreadCount === 1 ? '' : 's'} ·{' '}
                          {(snap.bytes / 1024 / 1024).toFixed(1)} MB
                        </div>
                      </div>
                      <button
                        onClick={() => restoreSnapshot(snap.id, snap.savedAt)}
                        disabled={historyBusy}
                        style={{
                          padding: '3px 8px', fontSize: 9, fontWeight: 600,
                          background: '#1a3580', color: '#fff', border: 'none',
                          borderRadius: 3, cursor: historyBusy ? 'wait' : 'pointer',
                          opacity: historyBusy ? 0.5 : 1,
                        }}
                      >Restore</button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* Backup section — portable .photobook file export/import */}
        <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 12, marginTop: 4 }}>
          <div style={{ fontSize: 10, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Backup
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              onClick={handleBackupClick}
              disabled={backupState.status === 'saving'}
              style={{
                ...btnBackup,
                opacity: backupState.status === 'saving' ? 0.6 : 1,
                cursor: backupState.status === 'saving' ? 'wait' : 'pointer',
              }}
              title="Download current project as a portable .photobook file"
            >
              {backupState.status === 'saving' ? '⏳ Preparing backup…' : '↓ Download backup'}
            </button>
            <button onClick={handleRestoreClick} style={btnBackup} title="Restore a .photobook file from disk">
              ↑ Restore from file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".photobook,application/json"
              style={{ display: 'none' }}
              onChange={handleFilePicked}
            />
          </div>
          {backupState.status === 'done' && (
            <div style={{
              padding: '7px 10px', marginBottom: 6,
              background: '#0e1a10', border: '1px solid #1e3a20',
              borderRadius: 4, fontSize: 11, color: '#6fcf97', lineHeight: 1.5,
            }}>
              ✓ {backupState.message}
            </div>
          )}
          {backupState.status === 'error' && (
            <div style={{
              padding: '7px 10px', marginBottom: 6,
              background: '#1a0808', border: '1px solid #5a1a1a',
              borderRadius: 4, fontSize: 11, color: '#e05c5c', lineHeight: 1.5,
            }}>
              ✕ {backupState.message}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#444', lineHeight: 1.5 }}>
            Projects are saved in this browser automatically. Use Download backup before clearing
            cache or moving to a different machine.
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return 'never';
  const d = new Date(ts);
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

const btnPrimary = {
  padding: '9px 16px', fontSize: 12, fontWeight: 600,
  background: '#1a3580', color: '#fff', border: 'none',
  borderRadius: 5, cursor: 'pointer', whiteSpace: 'nowrap',
};
const btnGhost = {
  padding: '6px 12px', fontSize: 12,
  background: 'transparent', color: '#888', border: '1px solid #2a2a2a',
  borderRadius: 5, cursor: 'pointer',
};
const iconBtn = {
  background: 'none', border: 'none', color: '#666',
  fontSize: 14, cursor: 'pointer', padding: '4px 8px',
};
const btnBackup = {
  flex: 1, padding: '8px 12px', fontSize: 11,
  background: '#0e1620', color: '#6a9fd8',
  border: '1px solid #1e2d45', borderRadius: 5,
  cursor: 'pointer', whiteSpace: 'nowrap',
};
