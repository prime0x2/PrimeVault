import { describe, expect, it } from 'vitest';
import { createMemoryBackend, STORAGE_KEYS } from '~/storage/client';
import {
  autoLockMinutesToMs,
  DEFAULT_PREFS,
  mergeDefaults,
  readPrefs,
  writePrefs,
} from '~/storage/prefs';

describe('mergeDefaults', () => {
  it('returns defaults for undefined / null / non-object', () => {
    expect(mergeDefaults(undefined)).toEqual(DEFAULT_PREFS);
    expect(mergeDefaults(null)).toEqual(DEFAULT_PREFS);
    expect(mergeDefaults('not-an-object')).toEqual(DEFAULT_PREFS);
    expect(mergeDefaults(42)).toEqual(DEFAULT_PREFS);
  });

  it('fills missing fields with defaults', () => {
    const partial = { theme: 'dark' as const };
    const result = mergeDefaults(partial);
    expect(result).toMatchObject({
      ...DEFAULT_PREFS,
      theme: 'dark',
    });
  });

  it('preserves valid stored values', () => {
    const stored = {
      ...DEFAULT_PREFS,
      theme: 'light' as const,
      autoLockMinutes: 15 as const,
    };
    expect(mergeDefaults(stored)).toEqual(stored);
  });

  it('falls back to default for an individual corrupt field', () => {
    // autoLockMinutes: 7 is not a valid option (only 0/1/2/5/15/60).
    const stored = {
      ...DEFAULT_PREFS,
      theme: 'dark' as const,
      autoLockMinutes: 7,
    };
    const result = mergeDefaults(stored);
    expect(result.theme).toBe('dark');
    expect(result.autoLockMinutes).toBe(DEFAULT_PREFS.autoLockMinutes);
  });

  it('forces prefsVersion to the current version', () => {
    const stored = { ...DEFAULT_PREFS, prefsVersion: 999 };
    expect(mergeDefaults(stored).prefsVersion).toBe(1);
  });
});

describe('readPrefs / writePrefs', () => {
  it('returns defaults when no prefs are stored', async () => {
    const backend = createMemoryBackend();
    expect(await readPrefs(backend)).toEqual(DEFAULT_PREFS);
  });

  it('round-trips a write', async () => {
    const backend = createMemoryBackend();
    const next = { ...DEFAULT_PREFS, theme: 'dark' as const };
    await writePrefs(backend, next);
    expect(await readPrefs(backend)).toEqual(next);
    expect(backend.snapshot()[STORAGE_KEYS.prefs]).toEqual(next);
  });
});

describe('autoLockMinutesToMs', () => {
  it('converts each option correctly', () => {
    expect(autoLockMinutesToMs(0)).toBe(0);
    expect(autoLockMinutesToMs(1)).toBe(60_000);
    expect(autoLockMinutesToMs(2)).toBe(120_000);
    expect(autoLockMinutesToMs(60)).toBe(3_600_000);
  });
});
