import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { LiveRegions } from './ui'
import { useIDEStore } from './store/useIDEStore.ts'

const container = document.getElementById('root')!

// The component gallery (UX-004) is a development-build page: `import.meta.env.DEV` is replaced by `false` in a
// production build, so the branch and the dynamic import below are removed from it (scripts/galleryBundle.test.ts).
if (import.meta.env.DEV && window.location.hash === '#ui-gallery') {
  void import('./ui/gallery/GalleryPage.tsx').then(({ GalleryPage }) => {
    createRoot(container).render(<StrictMode><GalleryPage /></StrictMode>)
  })
} else {
  // A failure outside the editor and the panels must never leave a blank window: retry, or close the project.
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary
        region="ZPLC Studio"
        fullWindow
        recovery={{ label: 'Close project and discard changes', run: () => { useIDEStore.getState().closeProject({ discardUnsaved: true }); } }}
      >
        <App />
        <LiveRegions />
      </ErrorBoundary>
    </StrictMode>,
  )
}
