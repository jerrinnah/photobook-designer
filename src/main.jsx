import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { useBookStore } from './store/useBookStore'
import { startAutosave } from './store/autosave'
import { trackAppUseOncePerSession } from './utils/supabase'

startAutosave(useBookStore)
trackAppUseOncePerSession()

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
