import { describe, expect, it, vi } from 'vitest';
import {
  type BrowserStorageArea,
  createBrowserBackend,
  createMemoryBackend,
  STORAGE_KEYS,
} from '../../src/storage/client';

describe('STORAGE_KEYS', () => {
  it('namespaces every key under "pv:"', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(key.startsWith('pv:')).toBe(true);
    }
  });
});

describe('createMemoryBackend', () => {
  it('round-trips arbitrary values', async () => {
    const backend = createMemoryBackend();
    await backend.set('a', { hello: 'world', n: 42 });
    expect(await backend.get('a')).toEqual({ hello: 'world', n: 42 });
  });

  it('returns undefined for absent keys', async () => {
    const backend = createMemoryBackend();
    expect(await backend.get('nope')).toBeUndefined();
  });

  it('removes keys', async () => {
    const backend = createMemoryBackend();
    await backend.set('a', 1);
    await backend.remove('a');
    expect(await backend.get('a')).toBeUndefined();
  });

  it('is isolated from outside mutation (clones on set and on get)', async () => {
    const backend = createMemoryBackend();
    const obj = { count: 1 };
    await backend.set('k', obj);
    obj.count = 999; // mutate after set
    const fetched = (await backend.get('k')) as { count: number };
    expect(fetched.count).toBe(1);
    fetched.count = 999; // mutate after get
    const refetched = (await backend.get('k')) as { count: number };
    expect(refetched.count).toBe(1);
  });

  it('seeds from an initial map', async () => {
    const backend = createMemoryBackend({ seeded: 'yes' });
    expect(await backend.get('seeded')).toBe('yes');
  });

  it('snapshot reflects every stored key', async () => {
    const backend = createMemoryBackend();
    await backend.set('a', 1);
    await backend.set('b', 2);
    expect(backend.snapshot()).toEqual({ a: 1, b: 2 });
  });
});

describe('createBrowserBackend', () => {
  function fakeArea(initial: Record<string, unknown> = {}): BrowserStorageArea {
    const store = new Map(Object.entries(initial));
    return {
      get: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of list) {
          if (store.has(k)) out[k] = store.get(k);
        }
        return out;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [k, v] of Object.entries(items)) store.set(k, v);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) store.delete(k);
      }),
    };
  }

  it('reads a single key by name', async () => {
    const area = fakeArea({ foo: 'bar' });
    const backend = createBrowserBackend(area);
    expect(await backend.get('foo')).toBe('bar');
    expect(area.get).toHaveBeenCalledWith('foo');
  });

  it('returns undefined when the key is absent', async () => {
    const backend = createBrowserBackend(fakeArea());
    expect(await backend.get('missing')).toBeUndefined();
  });

  it('writes by single-key object', async () => {
    const area = fakeArea();
    const backend = createBrowserBackend(area);
    await backend.set('x', 7);
    expect(area.set).toHaveBeenCalledWith({ x: 7 });
    expect(await backend.get('x')).toBe(7);
  });

  it('removes by single key', async () => {
    const area = fakeArea({ x: 7 });
    const backend = createBrowserBackend(area);
    await backend.remove('x');
    expect(area.remove).toHaveBeenCalledWith('x');
    expect(await backend.get('x')).toBeUndefined();
  });
});
