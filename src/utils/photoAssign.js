import { useBookStore } from '../store/useBookStore';

// Wraps the store's assignPhoto with a duplicate-use prompt.
// If the photo is already placed elsewhere in the book, asks the user
// whether they want to use it again before placing it.
//
// Returns true if the photo was placed (either fresh or after confirmation),
// false if the user declined.
export function assignPhotoWithPrompt(spreadId, cellIndex, photoId) {
  const state = useBookStore.getState();
  const { spreads, assignPhoto } = state;
  const idStr = String(photoId);

  // Find all cells that already hold this photo (excluding the target cell)
  const existing = [];
  spreads.forEach((sp, spIdx) => {
    sp.cells.forEach((c, ci) => {
      if (String(c.photoId) === idStr && !(sp.id === spreadId && ci === cellIndex)) {
        existing.push({ spreadId: sp.id, spreadIndex: spIdx + 1, cellIndex: ci });
      }
    });
  });

  if (existing.length === 0) {
    // Not used elsewhere — place normally
    assignPhoto(spreadId, cellIndex, photoId);
    return true;
  }

  const where = existing.length === 1
    ? `spread ${existing[0].spreadIndex}`
    : `${existing.length} other spreads`;
  const ok = window.confirm(
    `This photo is already used in ${where}.\n\nUse it here too? (Click Cancel to leave it where it is.)`
  );
  if (!ok) return false;

  assignPhoto(spreadId, cellIndex, photoId, { allowDuplicate: true });
  return true;
}
