/**
 * Tests for the dynamic auto-lock dependency. Phase 10 made
 * `autoLockMs` accept a function so prefs changes flow through without
 * recreating the session, and added "Never" semantics (`<= 0` disables
 * the timer; status returns `expiresAt: null`).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type LockScheduler } from '../../src/messaging/session';
import { createMemoryBackend } from '../../src/storage/client';

const TEST_ITERATIONS = 1000;

interface Clock {
  now: () => number;
  advance(ms: number): void;
  schedule: LockScheduler;
  fire: () => void;
  scheduledDelays: number[];
}

function makeClock(start = 1_000_000): Clock {
  let nowMs = start;
  let pendingFire: (() => void) | null = null;
  const scheduledDelays: number[] = [];

  return {
    now: () => nowMs,
    advance(ms) {
      nowMs += ms;
    },
    schedule: (delay, fire) => {
      scheduledDelays.push(delay);
      pendingFire = fire;
      return () => {
        pendingFire = null;
      };
    },
    fire: () => {
      const f = pendingFire;
      pendingFire = null;
      f?.();
    },
    scheduledDelays,
  };
}

describe('session — autoLockMs as a function', () => {
  let clock: Clock;
  let backend: ReturnType<typeof createMemoryBackend>;

  beforeEach(() => {
    clock = makeClock();
    backend = createMemoryBackend();
  });

  it('reads the auto-lock value on every activity bump', async () => {
    let configuredMs = 60_000;
    const session = createSession({
      backend,
      autoLockMs: () => configuredMs,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });

    const setup = await session.setupVault('master-pw');
    expect(setup.state).toBe('unlocked');
    if (setup.state === 'unlocked') {
      expect(setup.expiresAt).toBe(clock.now() + 60_000);
    }

    // Simulate a prefs change → auto-lock now 5 minutes.
    configuredMs = 5 * 60_000;
    const status = await session.status();
    if (status.state === 'unlocked') {
      expect(status.expiresAt).toBe(clock.now() + 5 * 60_000);
    }
    // Most recent scheduled delay matches the new value.
    expect(clock.scheduledDelays.at(-1)).toBe(5 * 60_000);
  });
});

describe('session — Never mode (autoLockMs <= 0)', () => {
  let clock: Clock;
  let backend: ReturnType<typeof createMemoryBackend>;

  beforeEach(() => {
    clock = makeClock();
    backend = createMemoryBackend();
  });

  it('returns null expiresAt and does not schedule', async () => {
    const session = createSession({
      backend,
      autoLockMs: 0,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });

    const setup = await session.setupVault('master-pw');
    expect(setup.state).toBe('unlocked');
    if (setup.state === 'unlocked') {
      expect(setup.expiresAt).toBeNull();
    }
    expect(clock.scheduledDelays).toEqual([]);
  });

  it('does not auto-lock as time passes', async () => {
    const session = createSession({
      backend,
      autoLockMs: 0,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('master-pw');

    // Advance well past any reasonable timeout — there's no timer to fire.
    clock.advance(7 * 24 * 60 * 60 * 1000);
    const status = await session.status();
    expect(status.state).toBe('unlocked');
  });

  it('switches from finite to Never on the next bump', async () => {
    let ms = 60_000;
    const session = createSession({
      backend,
      autoLockMs: () => ms,
      schedule: clock.schedule,
      now: clock.now,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('master-pw');

    ms = 0;
    const status = await session.status();
    if (status.state === 'unlocked') {
      expect(status.expiresAt).toBeNull();
    }
  });
});
