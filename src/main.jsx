import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { preloadAutosave, startAutosave } from './store/autosave'
import { trackAppUseOncePerSession, refreshUserTier, onAuthStateChange } from './utils/supabase'

async function boot() {
  // Hydrate the IndexedDB cache BEFORE importing the store so its
  // initial-state factory can read it synchronously.
  await preloadAutosave();
  const { useBookStore } = await import('./store/useBookStore');

  startAutosave(useBookStore);
  trackAppUseOncePerSession();
  refreshUserTier();

  // Subscribe to Supabase auth state changes globally — when a magic-link
  // sign-in completes, this syncs the profile to localStorage so the rest
  // of the app picks it up. Toolbar subscribes too for re-render.
  onAuthStateChange(() => { /* cache is updated inside the listener */ });

  // Warn before refresh / tab close if there's unsaved-looking content.
  // Registered here (not at module top) so useBookStore is guaranteed loaded.
  window.addEventListener('beforeunload', (e) => {
    const s = useBookStore.getState();
    const hasContent =
      (s.photos?.length ?? 0) > 0 ||
      (s.spreads || []).some((sp) => sp.cells?.some((c) => c.photoId)) ||
      (s.spreads || []).some((sp) => (sp.captions?.length ?? 0) > 0);
    if (!hasContent) return;
    e.preventDefault();
    e.returnValue = '';
  });

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
boot();
