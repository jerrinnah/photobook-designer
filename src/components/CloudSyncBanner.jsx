import { useEffect, useState } from 'react';
import { subscribeCloudSyncStatus } from '../utils/cloudSync';

// Two-purpose cloud sync UI:
//   1. Bottom-right chip that flashes "☁ Saved to cloud" after each
//      successful push, and turns amber if the last push errored.
//   2. Boot-time offer to pull a newer remote copy of any project the
//      user opened elsewhere. If they accept, we swap the active
//      project to the pulled one and reload. If not, next push
//      overwrites the newer remote — that's their choice.

export default function CloudSyncBanner() {
  const [status, setStatus] = useState({ state: 'idle' });
  const [newerRemote, setNewerRemote] = useState([]); // [{ projectId, name, remoteAt }]
  const [pulling, setPulling] = useState(false);

  useEffect(() => subscribeCloudSyncStatus(setStatus), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { findNewerRemote } = await import('../utils/cloudSync');
        const list = await findNewerRemote();
        if (!cancelled && list.length > 0) setNewerRemote(list);
      } catch (e) {
        console.info('[cloudSync] findNewerRemote skipped:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const pullOne = async (entry) => {
    if (pulling) return;
    setPulling(true);
    try {
      const { pullRemoteProject } = await import('../utils/cloudSync');
      const { setActiveProjectId } = await import('../store/projects');
      const result = await pullRemoteProject(entry.projectId);
      if (result?.status !== 'ok') {
        alert(`Couldn't pull the cloud copy: ${result?.error?.message || 'unknown error'}`);
        setPulling(false);
        return;
      }
      setActiveProjectId(entry.projectId);
      window.location.reload();
    } catch (e) {
      alert(e?.message || 'Pull failed.');
      setPulling(false);
    }
  };

  const dismissOne = (projectId) => {
    setNewerRemote((list) => list.filter((r) => r.projectId !== projectId));
  };

  // Toast chip visible for a few seconds after each push
  const showChip = status.state === 'pushed' || status.state === 'pushing' || status.state === 'error';

  return (
    <>
      {showChip && (
        <div style={{
          position: 'fixed', bottom: 14, left: 14,
          zIndex: 9200,
          padding: '5px 10px',
          background:
            status.state === 'error' ? '#1a0808'
            : status.state === 'pushing' ? '#0e1620'
            : '#0e1a10',
          border: `1px solid ${
            status.state === 'error' ? '#5a1a1a'
            : status.state === 'pushing' ? '#1e3a5f'
            : '#1e3a20'
          }`,
          borderRadius: 4,
          fontSize: 10,
          color:
            status.state === 'error' ? '#e05c5c'
            : status.state === 'pushing' ? '#9fb8d8'
            : '#6fcf97',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          pointerEvents: 'none',
          letterSpacing: 0.3,
        }}>
          {status.state === 'pushing' && '☁ Saving to cloud…'}
          {status.state === 'pushed'  && `☁ ${status.message || 'Saved to cloud'}`}
          {status.state === 'error'   && `☁ Cloud save failed`}
        </div>
      )}

      {newerRemote.length > 0 && (
        <div style={{
          position: 'fixed', top: 60, right: 20,
          zIndex: 9300,
          width: 360, maxWidth: 'calc(100vw - 40px)',
          padding: '12px 14px',
          background: '#0d1a2e', border: '1px solid #1e3a5f',
          borderRadius: 8,
          boxShadow: '0 12px 32px rgba(0,0,0,0.55)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: '#d0e0f5',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6, color: '#9fb8d8' }}>
            ☁ NEWER CLOUD VERSION AVAILABLE
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
            {newerRemote.length === 1
              ? 'A more recent copy of one of your projects was saved from another device.'
              : `${newerRemote.length} of your projects have newer copies saved from another device.`}
            {' '}Pull the cloud version to continue where you left off there.
          </div>
          {newerRemote.map((r) => (
            <div key={r.projectId} style={{
              padding: '6px 8px', marginBottom: 6,
              background: '#0a1420', border: '1px solid #1e3a5f',
              borderRadius: 5,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: '#e0e8f5', fontWeight: 500 }}>
                  {r.name || 'Untitled'}
                </div>
                <div style={{ fontSize: 9, color: '#7f97b8', marginTop: 1 }}>
                  Cloud saved {new Date(r.remoteAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => pullOne(r)}
                disabled={pulling}
                style={{
                  padding: '4px 10px', fontSize: 10, fontWeight: 600,
                  background: '#1a3580', color: '#fff', border: 'none',
                  borderRadius: 3, cursor: pulling ? 'wait' : 'pointer',
                  opacity: pulling ? 0.5 : 1,
                }}
              >Pull</button>
              <button
                onClick={() => dismissOne(r.projectId)}
                title="Skip this one"
                style={{
                  background: 'transparent', border: 'none',
                  color: '#7f97b8', cursor: 'pointer',
                  fontSize: 11, padding: '0 4px',
                }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
