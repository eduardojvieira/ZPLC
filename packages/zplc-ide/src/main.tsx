import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { useIDEStore } from './store/useIDEStore.ts'

// A failure outside the editor and the panels must never leave a blank window: retry, or close the project.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      region="ZPLC Studio"
      fullWindow
      recovery={{ label: 'Close project and discard changes', run: () => { useIDEStore.getState().closeProject({ discardUnsaved: true }); } }}
    >
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
