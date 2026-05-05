/**
 * Subscribes the options page to the persisted {@link Prefs} object.
 *
 * Why a hook (vs. a context): the options page is the only consumer that
 * needs reactive prefs; the popup just reads them once at boot. A standalone
 * hook with `chrome.storage.onChanged` keeps the wiring simple and avoids
 * a top-level provider for one screen.
 *
 * Returned `update` writes the merged prefs back to storage. The
 * `onChanged` listener will fire and update local state so writes are
 * effectively round-tripped through storage — keeps the source-of-truth
 * single (storage), at the cost of one extra render. Acceptable here.
 */

import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  createBrowserBackend,
  STORAGE_KEYS,
  type StorageBackend,
} from '../../storage/client';
import {
  DEFAULT_PREFS,
  mergeDefaults,
  type Prefs,
  readPrefs,
  writePrefs,
} from '../../storage/prefs';

export type PrefsState = { kind: 'loading' } | { kind: 'ready'; prefs: Prefs };

export interface UsePrefsResult {
  state: PrefsState;
  /** Apply a partial update. The full merged prefs are written back. */
  update: (patch: Partial<Prefs>) => Promise<void>;
}

export function usePrefs(): UsePrefsResult {
  const [state, setState] = useState<PrefsState>({ kind: 'loading' });
  // Cache the backend across renders. Created lazily because the test env
  // has no `browser` global; consumers in a non-extension context would
  // never reach this hook.
  const backend = useBackendOnce();

  useEffect(() => {
    let cancelled = false;
    void readPrefs(backend).then((prefs) => {
      if (!cancelled) setState({ kind: 'ready', prefs });
    });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    function listener(
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void {
      if (area !== 'local') return;
      const change = changes[STORAGE_KEYS.prefs];
      if (change === undefined) return;
      setState({ kind: 'ready', prefs: mergeDefaults(change.newValue) });
    }
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }, []);

  const update = useCallback(
    async (patch: Partial<Prefs>) => {
      const current =
        state.kind === 'ready' ? state.prefs : await readPrefs(backend);
      const merged: Prefs = { ...current, ...patch, prefsVersion: 1 };
      await writePrefs(backend, merged);
      // The onChanged listener will refresh state; no setState here.
    },
    [backend, state],
  );

  return { state, update };
}

let cachedBackend: StorageBackend | null = null;

function useBackendOnce(): StorageBackend {
  if (cachedBackend === null) {
    cachedBackend = createBrowserBackend(browser.storage.local);
  }
  return cachedBackend;
}

export const __test = { resetBackend: () => (cachedBackend = null) };

// Re-export defaults so the options page can fall back to them in the
// brief loading window.
export { DEFAULT_PREFS };
