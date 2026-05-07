// @vitest-environment happy-dom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub wxt/browser before the hook module is imported. The hook calls
// `createBrowserBackend(browser.storage.local)` and adds a listener on
// `browser.storage.onChanged`; both need to be functional in tests.

type Listener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void;

const storage = {
  data: {} as Record<string, unknown>,
  listeners: new Set<Listener>(),
};

const browserMock = {
  storage: {
    local: {
      async get(keys: string | string[]) {
        const arr = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of arr) {
          if (k in storage.data) out[k] = storage.data[k];
        }
        return out;
      },
      async set(items: Record<string, unknown>) {
        const changes: Record<
          string,
          { newValue?: unknown; oldValue?: unknown }
        > = {};
        for (const [k, v] of Object.entries(items)) {
          changes[k] = { newValue: v, oldValue: storage.data[k] };
          storage.data[k] = v;
        }
        for (const l of storage.listeners) l(changes, 'local');
      },
      async remove(keys: string | string[]) {
        const arr = Array.isArray(keys) ? keys : [keys];
        const changes: Record<
          string,
          { newValue?: unknown; oldValue?: unknown }
        > = {};
        for (const k of arr) {
          changes[k] = { oldValue: storage.data[k] };
          delete storage.data[k];
        }
        for (const l of storage.listeners) l(changes, 'local');
      },
    },
    onChanged: {
      addListener(l: Listener) {
        storage.listeners.add(l);
      },
      removeListener(l: Listener) {
        storage.listeners.delete(l);
      },
    },
  },
};

vi.mock('wxt/browser', () => ({ browser: browserMock }));

const { usePrefsSubscription, __test } = await import('~/storage/prefs-hook');
const { DEFAULT_PREFS } = await import('~/storage/prefs');

describe('usePrefsSubscription', () => {
  beforeEach(() => {
    storage.data = {};
    storage.listeners.clear();
    __test.resetBackend();
  });

  afterEach(() => {
    storage.listeners.clear();
  });

  it('returns the loading state on first render and resolves to defaults', async () => {
    const { result } = renderHook(() => usePrefsSubscription());
    expect(result.current.state.kind).toBe('loading');

    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });
    if (result.current.state.kind !== 'ready') throw new Error('not ready');
    expect(result.current.state.prefs).toEqual(DEFAULT_PREFS);
  });

  it('reads pre-existing prefs on mount', async () => {
    storage.data['pv:prefs'] = { ...DEFAULT_PREFS, theme: 'dark' };
    const { result } = renderHook(() => usePrefsSubscription());
    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });
    if (result.current.state.kind !== 'ready') throw new Error('not ready');
    expect(result.current.state.prefs.theme).toBe('dark');
  });

  it('updates state live when storage.onChanged fires for pv:prefs', async () => {
    const { result } = renderHook(() => usePrefsSubscription());
    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });

    // Simulate the options page (or a parallel mount) writing a new theme.
    await act(async () => {
      await browserMock.storage.local.set({
        'pv:prefs': { ...DEFAULT_PREFS, theme: 'light' },
      });
    });

    if (result.current.state.kind !== 'ready') throw new Error('not ready');
    expect(result.current.state.prefs.theme).toBe('light');
  });

  it('writes through update() and produces a corresponding onChanged event', async () => {
    const { result } = renderHook(() => usePrefsSubscription());
    await waitFor(() => {
      expect(result.current.state.kind).toBe('ready');
    });

    await act(async () => {
      await result.current.update({ autoLockMinutes: 5 });
    });

    expect(storage.data['pv:prefs']).toMatchObject({ autoLockMinutes: 5 });
    if (result.current.state.kind !== 'ready') throw new Error('not ready');
    expect(result.current.state.prefs.autoLockMinutes).toBe(5);
  });
});
