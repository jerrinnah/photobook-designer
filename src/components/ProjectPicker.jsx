import { useState, useEffect } from 'react';
import {
  getProjectIndex, createProject, deleteProject, duplicateProject,
  setActiveProjectId, getActiveProjectId,
} from '../store/projects';

// "My Projects" modal — lists every project saved in this browser.
// Click to switch (reloads the app). Plus / Duplicate / Delete actions.
export default function ProjectPicker({ open, onClose }) {
  const [projects, setProjects] = useState([]);
  const [renaming, setRenaming] = useState(null); // { id, value }
  const [newName, setNewName] = useState('');
  const activeId = getActiveProjectId();

  const refresh = async () => {
    const idx = await getProjectIndex();
    setProjects(idx.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)));
  };

  useEffect(() => { if (open) refresh(); }, [open]);

  if (!open) return null;

  const handleCreate = async () => {
    const name = newName.trim() || 'Untitled photobook';
    const id = await createProject(name);
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

        <div style={{ fontSize: 10, color: '#444', textAlign: 'center', paddingTop: 6, borderTop: '1px solid #1a1a1a' }}>
          Projects are saved in this browser. Use ↓ Save in the toolbar for a portable .photobook backup.
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
