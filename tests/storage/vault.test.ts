import { describe, expect, it } from 'vitest';
import { sealEnvelope } from '../../src/crypto/envelope';
import {
  createMemoryBackend,
  STORAGE_KEYS,
  type StorageBackend,
} from '../../src/storage/client';
import {
  clearVault,
  readVault,
  VaultQuotaError,
  writeVault,
} from '../../src/storage/vault';

const utf8 = (s: string) => new TextEncoder().encode(s);
const TEST_ITERATIONS = 1000;

async function freshEnvelope(payload = 'payload') {
  const { envelope } = await sealEnvelope('pw', utf8(payload), {
    iterations: TEST_ITERATIONS,
  });
  return envelope;
}

/** Wraps a backend so a chosen storage operation throws on the Nth call. */
function failAfter(
  backend: StorageBackend,
  op: 'set' | 'remove',
  callsBeforeFailure: number,
): StorageBackend {
  let count = 0;
  return {
    get: backend.get.bind(backend),
    set: async (key, value) => {
      if (op === 'set') {
        if (count >= callsBeforeFailure) throw new Error('simulated crash');
        count++;
      }
      return backend.set(key, value);
    },
    remove: async (key) => {
      if (op === 'remove') {
        if (count >= callsBeforeFailure) throw new Error('simulated crash');
        count++;
      }
      return backend.remove(key);
    },
  };
}

describe('readVault', () => {
  it('returns uninitialized when neither key is present', async () => {
    const backend = createMemoryBackend();
    expect(await readVault(backend)).toEqual({ kind: 'uninitialized' });
  });

  it('returns the parsed envelope when only pv:envelope is present', async () => {
    const env = await freshEnvelope();
    const backend = createMemoryBackend({ [STORAGE_KEYS.envelope]: env });
    const state = await readVault(backend);
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') {
      expect(state.envelope.version).toBe(env.version);
    }
  });

  it('throws when pv:envelope is malformed and there is no .next', async () => {
    const backend = createMemoryBackend({
      [STORAGE_KEYS.envelope]: { not: 'an envelope' },
    });
    await expect(readVault(backend)).rejects.toThrow();
  });
});

describe('readVault — atomic-write recovery', () => {
  it('promotes pv:envelope.next when .next is well-formed and current is absent', async () => {
    const env = await freshEnvelope('staged');
    const backend = createMemoryBackend({ [STORAGE_KEYS.envelopeNext]: env });

    const state = await readVault(backend);
    expect(state.kind).toBe('ready');

    // After recovery, .next must be cleared and .envelope populated.
    const after = backend.snapshot();
    expect(after[STORAGE_KEYS.envelopeNext]).toBeUndefined();
    expect(after[STORAGE_KEYS.envelope]).toBeDefined();
  });

  it('promotes pv:envelope.next over an older pv:envelope', async () => {
    const oldEnv = await freshEnvelope('old');
    const newEnv = await freshEnvelope('new');
    const backend = createMemoryBackend({
      [STORAGE_KEYS.envelope]: oldEnv,
      [STORAGE_KEYS.envelopeNext]: newEnv,
    });

    const state = await readVault(backend);
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') {
      // The recovered envelope should be newEnv (matching ciphertext / iv).
      expect(state.envelope.cipher.iv).toBe(newEnv.cipher.iv);
      expect(state.envelope.cipher.ciphertext).toBe(newEnv.cipher.ciphertext);
    }
    expect(backend.snapshot()[STORAGE_KEYS.envelopeNext]).toBeUndefined();
  });

  it('discards a malformed .next and falls back to the current envelope', async () => {
    const env = await freshEnvelope('current');
    const backend = createMemoryBackend({
      [STORAGE_KEYS.envelope]: env,
      [STORAGE_KEYS.envelopeNext]: { garbage: true },
    });

    const state = await readVault(backend);
    expect(state.kind).toBe('ready');
    if (state.kind === 'ready') {
      expect(state.envelope.cipher.iv).toBe(env.cipher.iv);
    }
    expect(backend.snapshot()[STORAGE_KEYS.envelopeNext]).toBeUndefined();
  });

  it('returns uninitialized when both keys are malformed/missing after .next is discarded', async () => {
    const backend = createMemoryBackend({
      [STORAGE_KEYS.envelopeNext]: { garbage: true },
    });
    expect(await readVault(backend)).toEqual({ kind: 'uninitialized' });
  });
});

describe('writeVault', () => {
  it('persists to pv:envelope and removes pv:envelope.next', async () => {
    const backend = createMemoryBackend();
    const env = await freshEnvelope();

    await writeVault(backend, env);

    const after = backend.snapshot();
    expect(after[STORAGE_KEYS.envelope]).toBeDefined();
    expect(after[STORAGE_KEYS.envelopeNext]).toBeUndefined();
  });

  it('rejects an invalid envelope before touching storage', async () => {
    const backend = createMemoryBackend();
    await expect(
      writeVault(backend, { totally: 'wrong' } as never),
    ).rejects.toThrow();
    expect(backend.snapshot()).toEqual({});
  });

  it('survives a crash between .next-write and current-write (next read recovers)', async () => {
    const real = createMemoryBackend();
    const env = await freshEnvelope();
    // Fail on the SECOND set call: that's the swap to pv:envelope.
    const flaky = failAfter(real, 'set', 1);

    await expect(writeVault(flaky, env)).rejects.toThrow('simulated crash');

    // pv:envelope.next is left behind, pv:envelope is absent.
    expect(real.snapshot()[STORAGE_KEYS.envelopeNext]).toBeDefined();
    expect(real.snapshot()[STORAGE_KEYS.envelope]).toBeUndefined();

    // Recovery: a fresh readVault should promote .next.
    const state = await readVault(real);
    expect(state.kind).toBe('ready');
    expect(real.snapshot()[STORAGE_KEYS.envelopeNext]).toBeUndefined();
    expect(real.snapshot()[STORAGE_KEYS.envelope]).toBeDefined();
  });

  it('translates a quota-shaped backend error into VaultQuotaError', async () => {
    const real = createMemoryBackend();
    const env = await freshEnvelope();
    const quotaBackend: StorageBackend = {
      ...real,
      set: async () => {
        throw new Error('QUOTA_BYTES_PER_ITEM exceeded');
      },
    };
    await expect(writeVault(quotaBackend, env)).rejects.toBeInstanceOf(
      VaultQuotaError,
    );
  });

  it('rethrows non-quota errors as-is', async () => {
    const real = createMemoryBackend();
    const env = await freshEnvelope();
    const flaky = failAfter(real, 'set', 0);
    await expect(writeVault(flaky, env)).rejects.toThrow('simulated crash');
  });

  it('survives a crash before the final remove (.next still cleared on next read)', async () => {
    const real = createMemoryBackend();
    const env = await freshEnvelope();
    // Fail on the FIRST remove call: the cleanup of pv:envelope.next.
    const flaky = failAfter(real, 'remove', 0);

    await expect(writeVault(flaky, env)).rejects.toThrow('simulated crash');

    // Both keys are present; .next still exists.
    expect(real.snapshot()[STORAGE_KEYS.envelope]).toBeDefined();
    expect(real.snapshot()[STORAGE_KEYS.envelopeNext]).toBeDefined();

    // Recovery: readVault promotes .next (same as current here) and removes .next.
    await readVault(real);
    expect(real.snapshot()[STORAGE_KEYS.envelopeNext]).toBeUndefined();
    expect(real.snapshot()[STORAGE_KEYS.envelope]).toBeDefined();
  });
});

describe('clearVault', () => {
  it('removes both envelope keys', async () => {
    const env = await freshEnvelope();
    const backend = createMemoryBackend({
      [STORAGE_KEYS.envelope]: env,
      [STORAGE_KEYS.envelopeNext]: env,
      [STORAGE_KEYS.prefs]: { theme: 'dark' },
    });

    await clearVault(backend);

    const after = backend.snapshot();
    expect(after[STORAGE_KEYS.envelope]).toBeUndefined();
    expect(after[STORAGE_KEYS.envelopeNext]).toBeUndefined();
    // Prefs are intentionally left intact.
    expect(after[STORAGE_KEYS.prefs]).toEqual({ theme: 'dark' });
  });
});
