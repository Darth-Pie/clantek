import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SessionProvider } from './lib/session';
import { ThemeProvider } from './lib/theme';
import { BrandingProvider } from './lib/branding';
import { BrandmarkProvider } from './lib/brandmark';
import { SigilProvider } from './lib/sigil';
import BrandmarkSplash from './components/BrandmarkSplash';
import { applyA11yPrefs, loadA11yPrefs } from './lib/a11y';
import './styles.css';

// Apply the viewer's personal text-size / high-contrast prefs before the first
// paint, so there's no flash of default size or colours.
applyA11yPrefs(loadA11yPrefs());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <BrandingProvider>
          <BrandmarkProvider>
            <SigilProvider>
              <BrandmarkSplash />
              <SessionProvider>
                <App />
              </SessionProvider>
            </SigilProvider>
          </BrandmarkProvider>
        </BrandingProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);

// Register the PWA service worker (offline shell + installable). Best-effort:
// on localhost dev and unsupported browsers this simply no-ops. Skipped for the
// Vite dev server, whose module URLs the SW's asset caching shouldn't touch.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
