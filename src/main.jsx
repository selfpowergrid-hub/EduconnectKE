import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'

// Always start fresh — purge any Supabase session keys from localStorage
// so no previously-saved session can bypass the login screen.
Object.keys(localStorage)
  .filter(key => key.startsWith('sb-'))
  .forEach(key => localStorage.removeItem(key));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
