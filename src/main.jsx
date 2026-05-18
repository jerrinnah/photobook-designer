import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { preloadAutosave, startAutosave } from './store/autosave'
import { trackAppUseOncePerSession, refreshUserTier, onAuthStateChange } from './utils/supabase'

async function boot() {
  // Hydrate the IndexedDB cache before importing the store so its
  // initial-state factory can read it synchronously.
  await preloadAutosave();
  const { useBookStore } = await import('./store/useBookStore');

  startAutosave(useBookStore);
  trackAppUseOncePerSession();
  refreshUserTier();

  // Subscribe to Supabase auth state changes globally — when a magic-link
  // sign-in happens (the user returns from clicking the email link), this
  // fires SIGNED_IN and syncs their profile to localStorage so the rest
  // of the app picks it up. Toolbar already listens too for re-render.
  onAuthStateChange(() => { /* profile cache is updated inside the listener */ });

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
boot();

// Prevent accidental refresh / tab close from losing work.
// Browsers show a generic "Changes you made may not be saved" dialog.
// Only triggers when the project has meaningful content (any photos in the
// library OR any spread has a photo placed). Cmd/Ctrl+R, ✕ button, and
// typing a new URL all hit it.
window.addEventListener('beforeunload', (e) => {
  const s = useBookStore.getState();
  const hasContent =
    (s.photos?.length ?? 0) > 0 ||
    (s.spreads || []).some((sp) => sp.cells?.some((c) => c.photoId)) ||
    (s.spreads || []).some((sp) => (sp.captions?.length ?? 0) > 0);
  if (!hasContent) return; // empty project — no warning needed
  e.preventDefault();
  e.returnValue = ''; // required by some browsers to show the dialog
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
