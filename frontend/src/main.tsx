import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { TooltipProvider } from '@/components/ui/tooltip'

// Loaded separately so that visitors to the landing page do not download the app, and the reverse.
const App = lazy(() => import('./App.tsx'))
const Landing = lazy(() => import('./Landing.tsx'))

/** The notes app lives under /app; every other path shows the landing page. */
const isApp = /^\/app(\/|$)/.test(window.location.pathname)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {isApp ? (
        <TooltipProvider>
          <App />
        </TooltipProvider>
      ) : (
        <Landing />
      )}
    </Suspense>
  </StrictMode>,
)
