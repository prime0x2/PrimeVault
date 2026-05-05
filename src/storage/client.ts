/**
 * Typed storage client. See SPEC §6.
 *
 * The client is parameterized over a {@link StorageBackend} so that production
 * code can wire it to `browser.storage.local` (via {@link createBrowserBackend})
 * while tests use {@link createMemoryBackend}. The keys are namespaced under
 * `pv:` so they don't collide with anything else the user may store.
 */

/** Per-key map for the vault's slot in `chrome.storage.local`. SPEC §6.2/§6.4. */
export const STORAGE_KEYS = {
  envelope: 'pv:envelope',
  envelopeNext: 'pv:envelope.next',
  prefs: 'pv:prefs',
  meta: 'pv:meta',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export interface StorageBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Structural shape of a WebExtension storage area
 * (`browser.storage.local` / `chrome.storage.local`). Declared here so this
 * module has no dependency on `wxt/browser` and remains importable in node
 * test environments.
 */
export interface BrowserStorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/**
 * Adapt a WebExtension storage area to a {@link StorageBackend}. The wrapper
 * folds the API down to single-key operations, which is what the vault and
 * prefs layers want.
 */
export function createBrowserBackend(area: BrowserStorageArea): StorageBackend {
  return {
    async get(key) {
      const result = await area.get(key);
      return result[key];
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
  };
}

export interface MemoryBackend extends StorageBackend {
  /** Read-only snapshot of every stored key. Useful for assertions. */
  snapshot(): Record<string, unknown>;
}

/**
 * In-memory backend for tests. Mimics `chrome.storage.local`'s
 * structured-clone semantics: values are deep-copied on read and write so
 * later mutations of the original object don't leak in or out.
 */
export function createMemoryBackend(
  initial: Record<string, unknown> = {},
): MemoryBackend {
  const store = new Map<string, unknown>(
    Object.entries(initial).map(([k, v]) => [k, structuredClone(v)]),
  );
  return {
    async get(key) {
      return store.has(key) ? structuredClone(store.get(key)) : undefined;
    },
    async set(key, value) {
      store.set(key, structuredClone(value));
    },
    async remove(key) {
      store.delete(key);
    },
    snapshot() {
      return Object.fromEntries(
        Array.from(store.entries(), ([k, v]) => [k, structuredClone(v)]),
      );
    },
  };
}
