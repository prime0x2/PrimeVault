/**
 * Phase 11: backup export + import flows.
 *
 * Invariants worth pinning:
 *  - exportEncrypted re-verifies password against on-disk ciphertext
 *    (matches change-password / unlock), then returns the envelope as-is.
 *    No re-encryption — the envelope IS the backup.
 *  - importEncrypted validates AND decrypts BEFORE touching local
 *    storage. A bad backup never trashes a working vault.
 *  - exportPlaintext returns the decrypted entries[]; the caller is
 *    responsible for download formatting.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type LockScheduler } from '../../src/messaging/session';
import { createMemoryBackend, STORAGE_KEYS } from '../../src/storage/client';

const TEST_ITERATIONS = 1000;
const AUTO_LOCK_MS = 60_000;

interface Clock {
  now: () => number;
  schedule: LockScheduler;
}

function makeClock(): Clock {
  const start = 1_000_000;
  return {
    now: () => start,
    schedule: () => () => undefined,
  };
}

describe('session — exportEncrypted', () => {
  let clock: Clock;
  let backend: ReturnType<typeof createMemoryBackend>;

  beforeEach(() => {
    clock = makeClock();
    backend = createMemoryBackend();
  });

  it('rejects when no vault exists', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await expect(session.exportEncrypted('any')).rejects.toMatchObject({
      code: 'notInitialized',
    });
  });

  it('rejects with wrongPassword when password is wrong', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('right-pw');
    await expect(session.exportEncrypted('wrong-pw')).rejects.toMatchObject({
      code: 'wrongPassword',
    });
  });

  it('returns the on-disk envelope unchanged on success', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    const onDisk = backend.snapshot()[STORAGE_KEYS.envelope];
    const exported = await session.exportEncrypted('pw');
    expect(exported).toEqual(onDisk);
  });
});

describe('session — importEncrypted', () => {
  let clock: Clock;
  let backend: ReturnType<typeof createMemoryBackend>;

  beforeEach(() => {
    clock = makeClock();
    backend = createMemoryBackend();
  });

  it('replaces the local envelope and leaves session unlocked', async () => {
    // Build the "backup" by setting up a separate vault, exporting it,
    // then resetting and importing into a fresh session.
    const sourceBackend = createMemoryBackend();
    const sourceSession = createSession({
      backend: sourceBackend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await sourceSession.setupVault('source-pw');
    const sourceEntry = await sourceSession.addEntry({
      name: 'Imported',
      value: 'imported_value',
    });
    const exportedEnvelope = await sourceSession.exportEncrypted('source-pw');

    const targetSession = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    const status = await targetSession.importEncrypted(
      exportedEnvelope,
      'source-pw',
    );
    expect(status.state).toBe('unlocked');

    // Entries from the source are now visible in the target.
    const entries = await targetSession.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(sourceEntry.id);
    expect(entries[0]?.value).toBe('imported_value');
  });

  it('rejects with wrongPassword when the import password is wrong', async () => {
    const sourceBackend = createMemoryBackend();
    const sourceSession = createSession({
      backend: sourceBackend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await sourceSession.setupVault('source-pw');
    const exported = await sourceSession.exportEncrypted('source-pw');

    const targetSession = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await expect(
      targetSession.importEncrypted(exported, 'wrong-pw'),
    ).rejects.toMatchObject({ code: 'wrongPassword' });
  });

  it('does not overwrite local vault when import fails', async () => {
    // Set up the target with its own data, then attempt to import a
    // backup with the wrong password. Local data should be intact.
    const targetSession = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await targetSession.setupVault('local-pw');
    const original = backend.snapshot()[STORAGE_KEYS.envelope];

    const sourceBackend = createMemoryBackend();
    const sourceSession = createSession({
      backend: sourceBackend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await sourceSession.setupVault('source-pw');
    const exported = await sourceSession.exportEncrypted('source-pw');

    await expect(
      targetSession.importEncrypted(exported, 'wrong-pw'),
    ).rejects.toMatchObject({ code: 'wrongPassword' });

    // Local envelope unchanged.
    expect(backend.snapshot()[STORAGE_KEYS.envelope]).toEqual(original);
  });

  it('replaces a pre-existing local vault on a successful import', async () => {
    const targetSession = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await targetSession.setupVault('local-pw');
    await targetSession.addEntry({ name: 'Local', value: 'local_value' });

    const sourceBackend = createMemoryBackend();
    const sourceSession = createSession({
      backend: sourceBackend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await sourceSession.setupVault('source-pw');
    await sourceSession.addEntry({ name: 'Source', value: 'source_value' });
    const exported = await sourceSession.exportEncrypted('source-pw');

    await targetSession.importEncrypted(exported, 'source-pw');

    const entries = await targetSession.getEntries();
    expect(entries.map((e) => e.name)).toEqual(['Source']);
  });
});

describe('session — exportPlaintext', () => {
  let clock: Clock;
  let backend: ReturnType<typeof createMemoryBackend>;

  beforeEach(() => {
    clock = makeClock();
    backend = createMemoryBackend();
  });

  it('rejects when no vault exists', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await expect(session.exportPlaintext('any')).rejects.toMatchObject({
      code: 'notInitialized',
    });
  });

  it('rejects with wrongPassword when password is wrong', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    await expect(session.exportPlaintext('nope')).rejects.toMatchObject({
      code: 'wrongPassword',
    });
  });

  it('returns the decrypted entries on success', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    await session.addEntry({ name: 'A', value: 'a_value' });
    await session.addEntry({ name: 'B', value: 'b_value' });

    const entries = await session.exportPlaintext('pw');
    expect(entries.map((e) => e.name).sort()).toEqual(['A', 'B']);
    expect(entries.find((e) => e.name === 'A')?.value).toBe('a_value');
  });
});
