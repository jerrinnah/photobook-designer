import { useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useBookStore } from '../store/useBookStore';
import { loadPhoto } from '../utils/photoLoader';
import { assignPhotoWithPrompt } from '../utils/photoAssign';
import { useLocalStorage } from '../hooks/useLocalStorage';
import CollapsedRail from './CollapsedRail';
import { useTheme } from '../utils/theme';
import { getKeyDescriptor, scorePhotos } from '../utils/faceDetect';

// ── Perceptual hashing (dHash 8×8 = 64-bit fingerprint) ──────────────
// Resizes image to 9×8 greyscale, compares adjacent horizontal pixels.
function computeDHash(src) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 9;
      canvas.height = 8;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 9, 8);
      const { data } = ctx.getImageData(0, 0, 9, 8);
      const bits = [];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          const i = (y * 9 + x) * 4;
          const j = i + 4;
          const lum = (r, g, b) => r * 0.299 + g * 0.587 + b * 0.114;
          bits.push(lum(data[i], data[i + 1], data[i + 2]) < lum(data[j], data[j + 1], data[j + 2]) ? 1 : 0);
        }
      }
      resolve(bits);
    };
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

function hammingDistance(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// Groups photos into similarity clusters using union-find.
// Two photos join the same cluster if their Hamming distance ≤ threshold.
function clusterSimilar(photos, hashes, threshold = 10) {
  const n = photos.length;
  const parent = photos.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { parent[find(i)] = find(j); };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (hammingDistance(hashes[i], hashes[j]) <= threshold) union(i, j);
    }
  }

  // Map photoId → root (cluster representative)
  const clusters = new Map(); // root → [indices]
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(i);
  }

  // Only return clusters with more than one member
  const simMap = new Map(); // photoId → { groupNum, isKeep }
  let groupNum = 0;
  for (const members of clusters.values()) {
    if (members.length < 2) continue;
    groupNum++;
    members.forEach((idx, pos) => {
      simMap.set(photos[idx].id, { groupNum, isKeep: pos === 0 });
    });
  }
  return simMap; // empty map = no duplicates found
}

export default function PhotoPanel({ mobile = false }) {
  const { t } = useTheme();
  const importBtnStyle = makeImportBtnStyle(t);
  const {
    photos, spreads, addPhotos, removePhoto,
    selectedPhotoIds, togglePhotoSelection, setPhotoSelection, selectAllPhotos, clearPhotoSelection,
    selectedCellIndex, activeSpreadId, assignPhoto, setSelectedCell,
    repeatedPhotoIds,
    photoFilter, setPhotoFilter,
    photoSort, setPhotoSort,
    photoSearch, setPhotoSearch,
    togglePhotoFavorite,
    setPhotoFacePriorities,
    resetProject,
  } = useBookStore();

  const [simMap, setSimMap] = useState(null);   // Map photoId → {groupNum, isKeep} | null
  const [computing, setComputing] = useState(false);
  // Face-priority state. faceState: null | 'scanning' | 'done'
  const [faceState, setFaceState] = useState(null);
  const [faceProgress, setFaceProgress] = useState({ done: 0, total: 0, hits: 0 });
  const [faceErr, setFaceErr] = useState(null);
  const hasFacePriority = photos.some((p) => (p.facePriority || 0) > 0);
  const hashCache = useRef(new Map()); // photoId → hash bits
  const [collapsed, setCollapsed] = useLocalStorage('photopanel-collapsed', false);

  // All photoIds currently referenced by cells — includes orphans (refs
  // to photos that no longer exist, e.g. after autosave dropped them).
  const refIds = new Set(
    spreads.flatMap((sp) => sp.cells.map((c) => c.photoId).filter(Boolean))
  );
  // Only count placements pointing at an actual photo in the library.
  const livePhotoIds = new Set(photos.map((p) => String(p.id)));
  const usedIds = new Set([...refIds].filter((id) => livePhotoIds.has(String(id))));
  const orphanCount = refIds.size - usedIds.size;

  const imagesInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [loadProgress, setLoadProgress] = useState(null); // { done, total } | null

  const ingestFiles = async (files) => {
    const images = [...files].filter((f) => f.type?.startsWith('image/'));
    if (images.length === 0) return;
    images.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
    setLoadProgress({ done: 0, total: images.length });
    // Load + tick progress one at a time so the indicator updates in real time
    const loaded = [];
    let done = 0;
    for (const file of images) {
      try {
        const photo = await loadPhoto(file);
        loaded.push(photo);
      } catch { /* skip unreadable files */ }
      done += 1;
      setLoadProgress({ done, total: images.length });
    }
    addPhotos(loaded);
    setSimMap(null);
    setLoadProgress(null);
  };

  // Drag-and-drop only — we provide our own Images / Folder buttons below.
  const { getRootProps, isDragActive } = useDropzone({
    accept: { 'image/*': [] },
    onDrop: ingestFiles,
    noClick: true,
    noKeyboard: true,
  });

  const handleImagesPick = async (e) => {
    if (e.target.files?.length) await ingestFiles(e.target.files);
    e.target.value = '';
  };

  // Folder pick: also force the panel sort to 'name' so the imported batch
  // appears in alphabetical/numerical order regardless of the previous sort.
  const handleFolderPick = async (e) => {
    if (e.target.files?.length) {
      await ingestFiles(e.target.files);
      setPhotoSort('name');
    }
    e.target.value = '';
  };

  // Sort base list
  const baseSorted = (() => {
    const arr = [...photos];
    if (photoSort === 'name') arr.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    else if (photoSort === 'newest') arr.reverse();
    else if (photoSort === 'portrait') arr.sort((a, b) => (a.height / a.width) - (b.height / b.width)).reverse();
    else if (photoSort === 'landscape') arr.sort((a, b) => (a.width / a.height) - (b.width / b.height)).reverse();
    return arr;
  })();

  // Filter + search
  const sorted = baseSorted.filter((p) => {
    if (photoSearch && !p.name.toLowerCase().includes(photoSearch.toLowerCase())) return false;
    if (photoFilter === 'used')      return usedIds.has(p.id);
    if (photoFilter === 'unused')    return !usedIds.has(p.id);
    if (photoFilter === 'favorites') return !!p.favorite;
    return true;
  });

  // ── Similarity scan ───────────────────────────────────────────────
  const handleFindSimilar = async () => {
    if (photos.length < 2) return;
    setComputing(true);
    setSimMap(null);
    try {
      // Compute / reuse cached hashes
      const hashes = await Promise.all(
        sorted.map((p) => {
          if (hashCache.current.has(p.id)) return Promise.resolve(hashCache.current.get(p.id));
          return computeDHash(p.src).then((h) => { hashCache.current.set(p.id, h); return h; });
        })
      );
      const result = clusterSimilar(sorted, hashes, 10);
      setSimMap(result);
      // Auto-select the duplicates (non-keepers) so user can review/delete
      if (result.size > 0) {
        const dupIds = new Set([...result.entries()].filter(([, v]) => !v.isKeep).map(([id]) => id));
        setPhotoSelection(dupIds);
      }
    } finally {
      setComputing(false);
    }
  };

  const handleClearSimilar = () => {
    setSimMap(null);
    clearPhotoSelection();
  };

  // ── Face prioritization ────────────────────────────────────────────
  // Uses the single selected photo as the "reference" of the key person.
  // Detects their face, scores every photo by how closely/prominently
  // that person appears, and stores facePriority so Design All / Arrange
  // place those photos first + in hero cells.
  const handlePrioritizeFace = async () => {
    if (faceState === 'scanning') return;
    setFaceErr(null);
    if (selectedPhotoIds.size !== 1) {
      setFaceErr('Select exactly one photo that clearly shows the person you want to prioritize, then click again.');
      return;
    }
    const refId = [...selectedPhotoIds][0];
    const refPhoto = photos.find((p) => p.id === refId);
    if (!refPhoto) { setFaceErr('Reference photo not found.'); return; }

    setFaceState('scanning');
    setFaceProgress({ done: 0, total: photos.length, hits: 0 });
    try {
      const keyDescriptor = await getKeyDescriptor(refPhoto.src);
      if (!keyDescriptor) {
        setFaceState(null);
        setFaceErr("Couldn't find a clear face in that photo. Pick one where the person faces the camera.");
        return;
      }
      const scores = await scorePhotos(photos, keyDescriptor, (done, total, hits) => {
        setFaceProgress({ done, total, hits });
      });
      // Reference photo is always the strongest match.
      scores.set(refId, 1);
      setPhotoFacePriorities(scores);
      setFaceState('done');
      clearPhotoSelection();
    } catch (e) {
      setFaceState(null);
      setFaceErr(e.message || 'Face scan failed.');
    }
  };

  const handleClearFacePriority = () => {
    setPhotoFacePriorities(null);
    setFaceState(null);
    setFaceErr(null);
  };

  // Count duplicate groups found
  const groupCount = simMap ? new Set([...simMap.values()].map((v) => v.groupNum)).size : 0;
  const dupCount = simMap ? [...simMap.values()].filter((v) => !v.isKeep).length : 0;

  const handlePhotoClick = (e, id) => {
    if (selectedCellIndex !== null) {
      const placed = assignPhotoWithPrompt(activeSpreadId, selectedCellIndex, id);
      if (placed) setSelectedCell(null);
      return;
    }
    if (e.shiftKey && selectedPhotoIds.size > 0) {
      const ids = sorted.map((p) => p.id);
      const lastSelected = [...selectedPhotoIds].pop();
      const lastIdx = ids.indexOf(lastSelected);
      const thisIdx = ids.indexOf(id);
      const [from, to] = lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
      setPhotoSelection(new Set([...selectedPhotoIds, ...ids.slice(from, to + 1)]));
    } else {
      togglePhotoSelection(id);
    }
  };

  const selCount = selectedPhotoIds.size;

  // Group colours for similar badges
  const GROUP_COLORS = ['#e05c5c', '#f6a623', '#b89fff', '#6fcf97', '#4f8ef7', '#f6c90e', '#ff8c69', '#7fffd4'];

  if (!mobile && collapsed) {
    return <CollapsedRail label="Photos" side="left" onExpand={() => setCollapsed(false)} />;
  }

  return (
    <aside data-tour="photos" style={{
      width: mobile ? '100%' : 180,
      height: mobile ? '100%' : undefined,
      background: t.bgPanel2,
      borderRight: mobile ? 'none' : `1px solid ${t.divider}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 8px 6px 12px' }}>
        <span style={{ fontSize: 10, color: t.textMuted, letterSpacing: 1, textTransform: 'uppercase' }}>Photos</span>
        {!mobile && (
          <button onClick={() => setCollapsed(true)} title="Collapse panel" style={{
            background: 'none', border: 'none', color: t.textFaint,
            fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1,
          }}>‹</button>
        )}
      </div>

      {/* Counters + hard reset */}
      <div style={{ padding: '0 12px 4px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: t.textMuted }}>{photos.length} total</span>
        <span style={{ fontSize: 10, color: '#3a5a3a' }}>· {usedIds.size} placed</span>
        {photos.length - usedIds.size > 0 && (
          <span style={{ fontSize: 10, color: '#8a6a1a' }}>· {photos.length - usedIds.size} unused</span>
        )}
        {orphanCount > 0 && (
          <span style={{ fontSize: 10, color: '#a55' }} title="Cells reference photos that are no longer in the library (often after a reload that dropped large photos). Click ↺ Reset to clear them.">
            · ⚠ {orphanCount} orphan
          </span>
        )}
        <button
          onClick={() => {
            const msg = orphanCount > 0
              ? `Reset everything? This clears ALL spreads, photos, and the autosave (including ${orphanCount} orphan reference${orphanCount === 1 ? '' : 's'}).`
              : 'Reset everything? This clears ALL spreads, photos, and the autosave.';
            if (confirm(msg)) resetProject();
          }}
          title="Hard reset — wipe all spreads, photos, and autosave"
          style={{
            marginLeft: 'auto',
            fontSize: 9, padding: '2px 7px',
            background: orphanCount > 0 ? (t.mode === 'light' ? '#fde8e8' : '#2a0808') : t.bgInput,
            border: `1px solid ${orphanCount > 0 ? '#a55' : t.border}`,
            color: orphanCount > 0 ? '#e05c5c' : t.textDim,
            borderRadius: 3, cursor: 'pointer',
            letterSpacing: 0.3,
          }}
        >↺ Reset</button>
      </div>

      {/* Search */}
      {photos.length > 0 && (
        <div style={{ padding: '0 10px 5px' }}>
          <input
            type="text"
            placeholder="Search by name…"
            value={photoSearch}
            onChange={(e) => setPhotoSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 4,
              color: t.text, fontSize: 10, padding: '4px 7px', outline: 'none',
            }}
          />
        </div>
      )}

      {/* Filter tabs */}
      {photos.length > 0 && (
        <div style={{ display: 'flex', borderBottom: `1px solid ${t.borderHard}`, marginBottom: 4 }}>
          {[['all','All'],['used','Used'],['unused','Free'],['favorites','★']].map(([key, label]) => (
            <button key={key}
              onClick={() => setPhotoFilter(key)}
              style={{
                flex: 1, padding: '4px 0', fontSize: 9, letterSpacing: 0.3,
                background: photoFilter === key ? (t.mode === 'light' ? '#e6edf8' : '#1e2535') : 'transparent',
                color: photoFilter === key ? '#4f8ef7' : t.textMuted,
                border: 'none',
                borderBottom: photoFilter === key ? '1px solid #4f8ef7' : `1px solid ${t.divider}`,
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Sort */}
      {photos.length > 0 && (
        <div style={{ padding: '0 10px 5px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: t.textMuted }}>Sort</span>
          <select
            value={photoSort}
            onChange={(e) => setPhotoSort(e.target.value)}
            style={{ flex: 1, background: t.bgInput, border: `1px solid ${t.border}`, borderRadius: 3, color: t.textDim, fontSize: 9, padding: '2px 4px', cursor: 'pointer', outline: 'none' }}
          >
            <option value="name">Name</option>
            <option value="newest">Newest</option>
            <option value="portrait">Portrait first</option>
            <option value="landscape">Landscape first</option>
          </select>
          <span style={{ fontSize: 9, color: t.textFaint }}>{sorted.length}</span>
        </div>
      )}

      {/* Prioritize a person (face) */}
      {photos.length >= 2 && (
        <div style={{ padding: '0 10px 6px' }}>
          {faceState === 'scanning' ? (
            <div style={{
              padding: '6px 8px', background: t.mode === 'light' ? '#fdf6e3' : '#1a1408',
              border: `1px solid ${t.mode === 'light' ? '#e8d27a' : '#3a2a10'}`,
              borderRadius: 4, fontSize: 10, color: '#c9a227', lineHeight: 1.5,
            }}>
              ★ Scanning faces… {faceProgress.done}/{faceProgress.total}
              {faceProgress.hits > 0 && <> · <span style={{ color: '#6fcf97' }}>{faceProgress.hits} matches</span></>}
            </div>
          ) : hasFacePriority ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 8px', background: t.mode === 'light' ? '#fffae0' : '#1a1408',
              border: `1px solid ${t.mode === 'light' ? '#e8d27a' : '#3a2a10'}`,
              borderRadius: 4, fontSize: 10, color: '#c9a227',
            }}>
              <span>★ {photos.filter((p) => (p.facePriority || 0) > 0).length} photos prioritized</span>
              <button onClick={handleClearFacePriority}
                style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: 10, cursor: 'pointer', padding: 0 }}>
                Clear
              </button>
            </div>
          ) : (
            <button
              onClick={handlePrioritizeFace}
              title="Select one photo of a key person, then click — their photos get hero placement in Design All"
              style={{
                width: '100%', padding: '5px 0',
                background: t.bgInput, border: `1px solid ${t.border}`,
                borderRadius: 4, color: t.textMuted, fontSize: 10, cursor: 'pointer',
              }}
            >
              ★ Prioritize a person
            </button>
          )}
          {faceErr && (
            <div style={{ marginTop: 4, fontSize: 9, color: '#e05c5c', lineHeight: 1.4 }}>{faceErr}</div>
          )}
        </div>
      )}

      {/* Find Similar button */}
      {photos.length >= 2 && (
        <div style={{ padding: '0 10px 6px' }}>
          {simMap === null ? (
            <button
              onClick={handleFindSimilar}
              disabled={computing}
              style={{
                width: '100%',
                padding: '5px 0',
                background: t.bgInput,
                border: `1px solid ${t.border}`,
                borderRadius: 4,
                color: computing ? t.textFaint : t.textMuted,
                fontSize: 10,
                cursor: computing ? 'wait' : 'pointer',
              }}
            >
              {computing ? '⏳ Scanning…' : '⟺ Find Similar'}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {groupCount === 0 ? (
                <div style={{ fontSize: 10, color: '#6fcf97', textAlign: 'center', padding: '3px 0' }}>
                  ✓ No similar photos found
                </div>
              ) : (
                <div style={{
                  padding: '5px 7px',
                  background: t.mode === 'light' ? '#fdf6e3' : '#1a1a0e',
                  border: `1px solid ${t.mode === 'light' ? '#e8d27a' : '#3a3a1a'}`,
                  borderRadius: 4,
                  fontSize: 10,
                  color: '#c9a227',
                  lineHeight: 1.5,
                }}>
                  <strong>{groupCount}</strong> similar group{groupCount !== 1 ? 's' : ''} found
                  <br />
                  <span style={{ color: t.textMuted }}>{dupCount} duplicate{dupCount !== 1 ? 's' : ''} selected</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 4 }}>
                {dupCount > 0 && (
                  <button
                    onClick={() => {
                      // Remove all selected duplicates
                      [...selectedPhotoIds].forEach((id) => removePhoto(id));
                      setSimMap(null);
                      clearPhotoSelection();
                    }}
                    style={{
                      flex: 1,
                      padding: '4px 0',
                      background: t.mode === 'light' ? '#fde8e8' : '#2a1010',
                      border: `1px solid ${t.mode === 'light' ? '#e8a0a0' : '#4a1a1a'}`,
                      borderRadius: 4,
                      color: '#e05c5c',
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    Remove {dupCount}
                  </button>
                )}
                <button
                  onClick={handleClearSimilar}
                  style={{
                    flex: 1,
                    padding: '4px 0',
                    background: 'transparent',
                    border: `1px solid ${t.border}`,
                    borderRadius: 4,
                    color: t.textMuted,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Place-in-cell mode banner */}
      {selectedCellIndex !== null && (
        <div style={{
          margin: '0 8px 6px',
          padding: '5px 8px',
          background: t.mode === 'light' ? '#e6edf8' : '#0d1a2e',
          border: `1px solid ${t.mode === 'light' ? '#a5bfe6' : '#1e3a5f'}`,
          borderRadius: 4,
          fontSize: 10,
          color: '#4f8ef7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}>
          <span>↑ Click to place in Cell {selectedCellIndex + 1}</span>
          <button
            onClick={() => setSelectedCell(null)}
            style={{ background: 'none', border: 'none', color: '#4f8ef7', cursor: 'pointer', fontSize: 11, lineHeight: 1, padding: 0 }}
          >✕</button>
        </div>
      )}

      {/* Selection controls */}
      {photos.length > 0 && (
        <div style={{ padding: '0 12px 8px', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={selectAllPhotos}
            style={{ fontSize: 9, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >All</button>
          <button
            onClick={clearPhotoSelection}
            style={{ fontSize: 9, color: selCount > 0 ? t.textMuted : t.textFaint, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >None</button>
          {selCount > 0 && (
            <span style={{ fontSize: 10, color: '#4f8ef7', marginLeft: 'auto' }}>{selCount} selected</span>
          )}
        </div>
      )}

      <div
        {...getRootProps()}
        style={{
          margin: '0 10px 10px',
          border: `1px dashed ${loadProgress ? '#4f8ef7' : isDragActive ? '#4f8ef7' : t.border}`,
          borderRadius: 6,
          padding: '8px 6px',
          textAlign: 'center',
          fontSize: 11,
          color: isDragActive ? '#4f8ef7' : t.textMuted,
          transition: 'all 0.15s',
        }}
      >
        <input ref={imagesInputRef} type="file" accept="image/*" multiple onChange={handleImagesPick} style={{ display: 'none' }} />
        <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleFolderPick} style={{ display: 'none' }} />
        {loadProgress ? (
          <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, color: '#4f8ef7', fontSize: 11,
            }}>
              <span style={{
                display: 'inline-block', width: 12, height: 12,
                border: '2px solid #1e2535', borderTopColor: '#4f8ef7',
                borderRadius: '50%',
                animation: 'photoSpin 0.7s linear infinite',
              }} />
              <span>Loading {loadProgress.done} / {loadProgress.total}</span>
            </div>
            <div style={{ width: '100%', height: 3, background: t.borderHard, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: `${(loadProgress.done / Math.max(1, loadProgress.total)) * 100}%`,
                height: '100%', background: '#4f8ef7',
                transition: 'width 0.15s',
              }} />
            </div>
            <style>{`@keyframes photoSpin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : isDragActive ? (
          <div style={{ padding: '6px 0' }}>Drop here</div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => imagesInputRef.current?.click()} style={importBtnStyle} title="Pick individual image files">
              🖼 Images
            </button>
            <button type="button" onClick={() => folderInputRef.current?.click()} style={importBtnStyle} title="Pick an entire folder — all images inside are imported">
              📁 Folder
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
        {sorted.map((p) => {
          const used = usedIds.has(p.id);
          const selected = selectedPhotoIds.has(p.id);
          const simInfo = simMap?.get(p.id);
          const groupColor = simInfo ? GROUP_COLORS[(simInfo.groupNum - 1) % GROUP_COLORS.length] : null;
          const isRepeated = repeatedPhotoIds.has(p.id);

          return (
            <div
              key={p.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('photoId', p.id)}
              onClick={(e) => handlePhotoClick(e, p.id)}
              style={{
                position: 'relative',
                marginBottom: 6,
                cursor: 'pointer',
                borderRadius: 4,
                overflow: 'hidden',
                opacity: used && !selected ? 0.45 : 1,
                transition: 'opacity 0.2s',
                outline: isRepeated
                  ? '2px solid #e05c5c'
                  : selected
                    ? `2px solid ${simInfo && !simInfo.isKeep ? groupColor : '#4f8ef7'}`
                    : simInfo
                      ? `2px solid ${groupColor}55`
                      : '2px solid transparent',
                outlineOffset: 1,
                width: isRepeated ? '55%' : undefined,
              }}
            >
              <img
                src={p.src}
                alt={p.name}
                style={{ width: '100%', display: 'block', borderRadius: 4, userSelect: 'none', pointerEvents: 'none' }}
              />

              {/* Key-person priority badge — gold star chip, top-right */}
              {(p.facePriority || 0) > 0 && (
                <div style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 18, height: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#f6c90e', color: '#1a1208',
                  borderRadius: '50%', fontSize: 11, lineHeight: 1,
                  fontWeight: 700, pointerEvents: 'none',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                }} title={`Key person (priority ${(p.facePriority).toFixed(2)})`}>
                  ★
                </div>
              )}

              {/* Repeated overlay */}
              {isRepeated && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(224,92,92,0.28)',
                  borderRadius: 4,
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start',
                  padding: '3px 4px',
                  pointerEvents: 'none',
                }}>
                  <span style={{ fontSize: 8, fontWeight: 700, color: '#fff', background: '#e05c5c', borderRadius: 2, padding: '1px 3px', letterSpacing: 0.3 }}>
                    DUP
                  </span>
                </div>
              )}

              {/* Similarity group badge */}
              {simInfo && (
                <div style={{
                  position: 'absolute',
                  top: 3,
                  left: selected ? 22 : 3,
                  background: simInfo.isKeep ? 'rgba(0,0,0,0.75)' : groupColor,
                  borderRadius: 3,
                  padding: '2px 5px',
                  fontSize: 9,
                  fontWeight: 700,
                  color: simInfo.isKeep ? groupColor : '#fff',
                  lineHeight: 1,
                  letterSpacing: 0.3,
                  border: simInfo.isKeep ? `1px solid ${groupColor}` : 'none',
                }}>
                  {simInfo.isKeep ? `≈${simInfo.groupNum}` : `≈${simInfo.groupNum} dup`}
                </div>
              )}

              {/* Selected checkmark */}
              {selected && (
                <div style={{
                  position: 'absolute',
                  top: 3,
                  left: 3,
                  width: 16,
                  height: 16,
                  background: '#4f8ef7',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <polyline points="2,4.5 3.8,6.5 7,3" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}

              {/* "Placed" badge */}
              {used && !selected && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'rgba(0,0,0,0.72)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '4px 0',
                }}>
                  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                    <circle cx="4.5" cy="4.5" r="4" stroke="#6fcf97" strokeWidth="1"/>
                    <polyline points="2.5,4.5 4,6 6.5,3" stroke="#6fcf97" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span style={{ fontSize: 9, color: '#6fcf97', letterSpacing: 0.5 }}>PLACED</span>
                </div>
              )}

              {/* Favorite button */}
              <button
                onClick={(e) => { e.stopPropagation(); togglePhotoFavorite(p.id); }}
                title={p.favorite ? 'Remove from favorites' : 'Add to favorites'}
                style={{
                  position: 'absolute',
                  bottom: 3,
                  right: 3,
                  background: p.favorite ? 'rgba(246,201,14,0.85)' : 'rgba(0,0,0,0.55)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  color: p.favorite ? '#1a1200' : '#888',
                  fontSize: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >★</button>

              {/* Remove button */}
              <button
                onClick={(e) => { e.stopPropagation(); removePhoto(p.id); }}
                style={{
                  position: 'absolute',
                  top: 3,
                  right: 3,
                  background: 'rgba(0,0,0,0.7)',
                  border: 'none',
                  borderRadius: '50%',
                  width: 18,
                  height: 18,
                  color: '#fff',
                  fontSize: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >✕</button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

const makeImportBtnStyle = (t) => ({
  flex: 1,
  padding: '6px 4px',
  background: t.bgInput,
  border: `1px solid ${t.border}`,
  borderRadius: 4,
  color: t.text,
  fontSize: 11,
  cursor: 'pointer',
});
