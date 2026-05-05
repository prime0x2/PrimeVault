import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { applyTheme } from '../../lib/theme';
import { createBrowserBackend } from '../../storage/client';
import { readPrefs } from '../../storage/prefs';
import App from './App.tsx';
import './style.css';

// Apply the user's theme as early as possible. The popup's first paint
// happens within ~50ms of opening, so we must read prefs and toggle the
// `.dark` / `.light` class before React mounts to avoid a wrong-theme
// flash. Async storage read fits within the natural pre-render window.
async function bootstrap(): Promise<void> {
  const backend = createBrowserBackend(browser.storage.local);
  try {
    const prefs = await readPrefs(backend);
    applyTheme(prefs.theme);
  } catch {
    // Prefs unreadable? Fall back to system theme (no class). Worst case is
    // a one-frame visual blip; we still want to mount the app.
  }

  // React to live theme changes from the options page. The popup is rarely
  // open while the options page is being changed, but this makes the
  // experience consistent if both are open at once.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const next = changes['pv:prefs']?.newValue;
    if (next === undefined) return;
    const themeRaw = (next as { theme?: unknown }).theme;
    if (themeRaw === 'system' || themeRaw === 'light' || themeRaw === 'dark') {
      applyTheme(themeRaw);
    }
  });

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
