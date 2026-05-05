/**
 * Shared core for the popup and options-page prefs hooks. Both subscribe to
 * `chrome.storage.onChanged` so changes from one surface (e.g. the options
 * tab) are reflected in the other (e.g. an open popup) live.
 *
 * Returns the current state machine plus an `update` writer. Higher-level
 * hooks pick the shape they want — the options page wants the full state
 * machine; the popup just wants a `Prefs` with defaults during the (very
 * brief) loading window before the first read resolves.
 */

import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  createBrowserBackend,
  STORAGE_KEYS,
  type StorageBackend,
} from './client';
import {
  DEFAULT_PREFS,
  mergeDefaults,
  type Prefs,
  readPrefs,
  writePrefs,
} from './prefs';

export type PrefsState = { kind: 'loading' } | { kind: 'ready'; prefs: Prefs };

export interface PrefsSubscription {
  state: PrefsState;
  /** Apply a partial update; the merged prefs are written back to storage. */
  update: (patch: Partial<Prefs>) => Promise<void>;
}

let cachedBackend: StorageBackend | null = null;

function getBackendOnce(): StorageBackend {
  if (cachedBackend === null) {
    cachedBackend = createBrowserBackend(browser.storage.local);
  }
  return cachedBackend;
}

export function usePrefsSubscription(): PrefsSubscription {
  const [state, setState] = useState<PrefsState>({ kind: 'loading' });
  const backend = getBackendOnce();

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

/** Test-only: drop the cached backend so a fresh hook gets a new one. */
export const __test = {
  resetBackend: () => {
    cachedBackend = null;
  },
};

// Re-export defaults so consumers can fall back during the loading window.
export { DEFAULT_PREFS };
