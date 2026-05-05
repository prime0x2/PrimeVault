/**
 * Lightweight prefs subscription for the popup. Mirrors the options
 * page's hook but stays narrow — the popup only cares about a couple of
 * fields (clipboard auto-clear, eventually accent). Keeping this
 * separate from the full Options-page hook avoids pulling that surface
 * area into the popup bundle.
 *
 * Reads once on mount, then keeps in sync via `storage.onChanged` so
 * settings tweaks made on the options tab are reflected in the popup
 * if it's open at the same time.
 */

import { useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { createBrowserBackend, STORAGE_KEYS } from '../../storage/client';
import { DEFAULT_PREFS, mergeDefaults, type Prefs } from '../../storage/prefs';

export function usePopupPrefs(): Prefs {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);

  useEffect(() => {
    let cancelled = false;
    const backend = createBrowserBackend(browser.storage.local);
    void backend.get(STORAGE_KEYS.prefs).then((raw) => {
      if (cancelled) return;
      setPrefs(mergeDefaults(raw));
    });
    function listener(
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void {
      if (area !== 'local') return;
      const change = changes[STORAGE_KEYS.prefs];
      if (change === undefined) return;
      setPrefs(mergeDefaults(change.newValue));
    }
    browser.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  return prefs;
}
