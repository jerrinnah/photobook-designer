import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { useBookStore } from './store/useBookStore'
import { startAutosave } from './store/autosave'
import { trackAppUseOncePerSession } from './utils/supabase'

startAutosave(useBookStore)
trackAppUseOncePerSession()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
