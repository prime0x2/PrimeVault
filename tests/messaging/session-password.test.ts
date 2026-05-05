/**
 * Phase 10b: changePassword + resetVault flows.
 *
 * Both methods touch crypto + storage and must preserve the invariants
 * spelled out in SPEC §4.5 / §4.6:
 *  - changePassword re-verifies the *current* password against on-disk
 *    ciphertext before rotating, even if the session was already unlocked.
 *  - changePassword leaves the vault unlocked under the new key.
 *  - The old password no longer decrypts after a successful rotation.
 *  - resetVault wipes the encrypted vault and returns the user to the
 *    onboarding state, regardless of session state.
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

describe('session — changePassword', () => {
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
    await expect(
      session.changePassword('current', 'next'),
    ).rejects.toMatchObject({ code: 'notInitialized' });
  });

  it('rejects with wrongPassword when current is incorrect', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('right-pw');
    await expect(
      session.changePassword('wrong-pw', 'next-pw'),
    ).rejects.toMatchObject({ code: 'wrongPassword' });
  });

  it('rotates the envelope under the new password and leaves session unlocked', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('old-pw');
    const before = backend.snapshot()[STORAGE_KEYS.envelope];

    const status = await session.changePassword('old-pw', 'new-pw');
    expect(status.state).toBe('unlocked');

    // The on-disk envelope should have new salt + new ciphertext (different
    // bytes than before — this is the visible side effect of rotation).
    const after = backend.snapshot()[STORAGE_KEYS.envelope];
    expect(after).not.toEqual(before);
  });

  it('after rotation, the old password no longer unlocks', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('old-pw');
    await session.changePassword('old-pw', 'new-pw');

    session.lock();
    await expect(session.unlock('old-pw')).rejects.toMatchObject({
      code: 'wrongPassword',
    });
  });

  it('after rotation, the new password unlocks', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('old-pw');
    await session.changePassword('old-pw', 'new-pw');

    session.lock();
    const status = await session.unlock('new-pw');
    expect(status.state).toBe('unlocked');
  });

  it('preserves entries across rotation', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('old-pw');
    const created = await session.addEntry({
      name: 'Test',
      value: 'sk_test_xxx',
    });

    await session.changePassword('old-pw', 'new-pw');

    const entries = await session.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe(created.id);
    expect(entries[0]?.value).toBe('sk_test_xxx');
  });

  it('works even when the session was previously locked', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('old-pw');
    session.lock();

    const status = await session.changePassword('old-pw', 'new-pw');
    expect(status.state).toBe('unlocked');
  });
});

describe('session — resetVault', () => {
  let clock: Clock;
  let backend: ReturnType<typeof createMemoryBackend>;

  beforeEach(() => {
    clock = makeClock();
    backend = createMemoryBackend();
  });

  it('returns uninitialized when there is nothing to reset', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    const status = await session.resetVault();
    expect(status).toEqual({ state: 'uninitialized' });
  });

  it('wipes the envelope from storage', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    expect(backend.snapshot()[STORAGE_KEYS.envelope]).toBeDefined();

    await session.resetVault();
    expect(backend.snapshot()[STORAGE_KEYS.envelope]).toBeUndefined();
    expect(backend.snapshot()[STORAGE_KEYS.envelopeNext]).toBeUndefined();
  });

  it('preserves prefs and meta', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    await backend.set(STORAGE_KEYS.prefs, { theme: 'dark' });
    await backend.set(STORAGE_KEYS.meta, { installedAt: '2026-05-01' });

    await session.resetVault();
    expect(backend.snapshot()[STORAGE_KEYS.prefs]).toEqual({ theme: 'dark' });
    expect(backend.snapshot()[STORAGE_KEYS.meta]).toEqual({
      installedAt: '2026-05-01',
    });
  });

  it('leaves the session locked (next status reads uninitialized)', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    await session.resetVault();
    expect(await session.status()).toEqual({ state: 'uninitialized' });
  });

  it('post-reset, setupVault works again with a fresh password', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('first-pw');
    await session.resetVault();

    const status = await session.setupVault('second-pw');
    expect(status.state).toBe('unlocked');
  });
});
