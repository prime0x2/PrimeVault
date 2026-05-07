import { beforeEach, describe, expect, it } from 'vitest';
import { MessagingError } from '~/messaging/protocol';
import { createSession, type LockScheduler } from '~/messaging/session';
import { createMemoryBackend, STORAGE_KEYS } from '~/storage/client';

const TEST_ITERATIONS = 1000;
const AUTO_LOCK_MS = 60_000;

interface Clock {
  now: () => number;
  advance(ms: number): void;
  schedule: LockScheduler;
  /** Fire the most recently-scheduled timer (simulating auto-lock elapsed). */
  fire: () => void;
  /** Number of cancel() calls observed since last reset. */
  cancels: () => number;
}

function makeClock(start = 1_000_000): Clock {
  let nowMs = start;
  let pendingFire: (() => void) | null = null;
  let cancelCount = 0;

  return {
    now: () => nowMs,
    advance(ms) {
      nowMs += ms;
    },
    schedule: (_delay, fire) => {
      pendingFire = fire;
      return () => {
        cancelCount++;
        pendingFire = null;
      };
    },
    fire: () => {
      const f = pendingFire;
      pendingFire = null;
      f?.();
    },
    cancels: () => cancelCount,
  };
}

describe('session — uninitialized → setup → locked → unlocked', () => {
  let clock: Clock;
  let backend: ReturnType<typeof createMemoryBackend>;

  beforeEach(() => {
    clock = makeClock();
    backend = createMemoryBackend();
  });

  it('reports uninitialized when storage is empty', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    expect(await session.status()).toEqual({ state: 'uninitialized' });
  });

  it('setupVault creates an envelope, returns unlocked, schedules auto-lock', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });

    const status = await session.setupVault('master-pw');
    expect(status.state).toBe('unlocked');
    if (status.state === 'unlocked') {
      expect(status.expiresAt).toBe(clock.now() + AUTO_LOCK_MS);
    }
    expect(backend.snapshot()[STORAGE_KEYS.envelope]).toBeDefined();
  });

  it('setupVault rejects when a vault already exists', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    session.lock();

    await expect(session.setupVault('pw')).rejects.toMatchObject({
      code: 'alreadyInitialized',
    });
  });

  it('after lock(), status reads disk and reports locked', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    session.lock();
    expect(await session.status()).toEqual({ state: 'locked' });
  });

  it('unlock with the right password returns to unlocked', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    session.lock();

    const status = await session.unlock('pw');
    expect(status.state).toBe('unlocked');
    if (status.state === 'unlocked') {
      expect(status.expiresAt).toBe(clock.now() + AUTO_LOCK_MS);
    }
  });

  it('unlock with the wrong password throws MessagingError(wrongPassword)', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('correct');
    session.lock();

    await expect(session.unlock('wrong')).rejects.toBeInstanceOf(
      MessagingError,
    );
    await expect(session.unlock('wrong')).rejects.toMatchObject({
      code: 'wrongPassword',
    });
    expect(await session.status()).toEqual({ state: 'locked' });
  });

  it('unlock rejects when vault is uninitialized', async () => {
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await expect(session.unlock('pw')).rejects.toMatchObject({
      code: 'notInitialized',
    });
  });
});

describe('session — auto-lock timer', () => {
  it('expires the session when the timer fires', async () => {
    const clock = makeClock();
    const backend = createMemoryBackend();
    const session = createSession({
      backend,
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });

    await session.setupVault('pw');

    // Simulate auto-lock elapsing.
    clock.advance(AUTO_LOCK_MS);
    clock.fire();

    expect(await session.status()).toEqual({ state: 'locked' });
  });

  it('every status() call while unlocked reschedules (resets) the timer', async () => {
    const clock = makeClock();
    const session = createSession({
      backend: createMemoryBackend(),
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });

    await session.setupVault('pw');
    const cancelsAfterSetup = clock.cancels();

    clock.advance(AUTO_LOCK_MS / 2);
    const status1 = await session.status();
    expect(status1.state).toBe('unlocked');
    if (status1.state === 'unlocked') {
      expect(status1.expiresAt).toBe(clock.now() + AUTO_LOCK_MS);
    }
    // Each bump cancels the previous timer before scheduling a new one.
    expect(clock.cancels()).toBeGreaterThan(cancelsAfterSetup);
  });

  it('manual lock cancels the pending timer', async () => {
    const clock = makeClock();
    const session = createSession({
      backend: createMemoryBackend(),
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });

    await session.setupVault('pw');
    const before = clock.cancels();
    session.lock();
    expect(clock.cancels()).toBe(before + 1);
  });

  it('does not reschedule after the timer has fired', async () => {
    const clock = makeClock();
    const session = createSession({
      backend: createMemoryBackend(),
      autoLockMs: AUTO_LOCK_MS,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    clock.fire(); // simulate auto-lock

    // Now status() reads from disk (locked); does not re-arm a timer.
    const before = clock.cancels();
    const status = await session.status();
    expect(status.state).toBe('locked');
    expect(clock.cancels()).toBe(before);
  });
});
