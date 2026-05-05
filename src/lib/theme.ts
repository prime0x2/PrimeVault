/**
 * Theme application. SPEC §10.1.
 *
 * The popup CSS keys dark mode off two things:
 *   1. `:root.dark` (manual override)
 *   2. `@media (prefers-color-scheme: dark)` scoped to `:root:not(.light)`
 *
 * Strategy:
 *   - `theme: 'dark'`   → add `.dark` class (force dark, beats media query)
 *   - `theme: 'light'`  → add `.light` class (suppresses the media query)
 *   - `theme: 'system'` → remove both classes (let the media query decide)
 *
 * `applyTheme` is idempotent and safe to call on every prefs change. It
 * reads/writes `document.documentElement` and is therefore a side-effecting
 * DOM helper — guard against `document` being undefined for non-browser
 * test environments.
 */

import type { Theme } from '../storage/prefs';

export function applyTheme(theme: Theme, root?: HTMLElement): void {
  const el =
    root ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (el === null) return;
  el.classList.remove('dark', 'light');
  if (theme === 'dark') {
    el.classList.add('dark');
  } else if (theme === 'light') {
    el.classList.add('light');
  }
}
