import React from 'react';
import ReactDOM from 'react-dom/client';
import { browser } from 'wxt/browser';
import { Options } from '../../features/options/Options';
import { applyTheme } from '../../lib/theme';
import { createBrowserBackend } from '../../storage/client';
import { readPrefs } from '../../storage/prefs';
import './style.css';

async function bootstrap(): Promise<void> {
  const backend = createBrowserBackend(browser.storage.local);
  try {
    const prefs = await readPrefs(backend);
    applyTheme(prefs.theme);
  } catch {
    // Ignore — render with system theme.
  }

  // Live theme updates: the user can change the theme on this page itself.
  // Each save fires storage.onChanged; apply immediately for instant feedback.
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
      <Options />
    </React.StrictMode>,
  );
}

void bootstrap();
