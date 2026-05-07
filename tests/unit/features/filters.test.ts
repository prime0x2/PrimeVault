import { describe, expect, it } from 'vitest';
import {
  buildExpiryCounts,
  buildKindCounts,
  type EntryWithUrgency,
  pickInlineKinds,
  sortVisibleKinds,
  withUrgency,
} from '~/features/vault/filters';
import type { Entry } from '~/storage/schema';

// Build a minimal Entry — only the fields the helpers actually inspect.
function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '01HXX0000000000000000000VV',
    name: 'GitHub',
    value: 'ghp_xxx',
    tags: [],
    kind: 'token',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    copyCount: 0,
    ...overrides,
  };
}

describe('withUrgency', () => {
  it('annotates each entry with its expiry urgency', () => {
    const out = withUrgency([
      entry({ name: 'no-expiry' }),
      entry({ name: 'far', expiresAt: '2099-01-01' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.urgency).toBeNull();
    expect(out[1]?.urgency).toBe('ok');
    expect(out[0]?.entry.name).toBe('no-expiry');
  });
});

describe('buildKindCounts', () => {
  it('counts each kind that appears', () => {
    const items: EntryWithUrgency[] = [
      { entry: entry({ kind: 'secret' }), urgency: null },
      { entry: entry({ kind: 'secret' }), urgency: null },
      { entry: entry({ kind: 'token' }), urgency: null },
      { entry: entry({ kind: 'api_key' }), urgency: null },
    ];
    expect(buildKindCounts(items)).toEqual({ secret: 2, token: 1, api_key: 1 });
  });

  it('returns an empty object for an empty list', () => {
    expect(buildKindCounts([])).toEqual({});
  });

  it('omits kinds with no occurrences (callers default to 0)', () => {
    const items: EntryWithUrgency[] = [
      { entry: entry({ kind: 'secret' }), urgency: null },
    ];
    const counts = buildKindCounts(items);
    expect(counts.token).toBeUndefined();
    expect(counts.password).toBeUndefined();
  });
});

describe('buildExpiryCounts', () => {
  it('counts only `expired` and `soon` urgencies', () => {
    const items: EntryWithUrgency[] = [
      { entry: entry(), urgency: 'expired' },
      { entry: entry(), urgency: 'expired' },
      { entry: entry(), urgency: 'soon' },
      { entry: entry(), urgency: 'ok' },
      { entry: entry(), urgency: null },
    ];
    expect(buildExpiryCounts(items)).toEqual({ expired: 2, soon: 1 });
  });

  it('returns 0/0 when no entries are urgent', () => {
    const items: EntryWithUrgency[] = [
      { entry: entry(), urgency: 'ok' },
      { entry: entry(), urgency: null },
    ];
    expect(buildExpiryCounts(items)).toEqual({ expired: 0, soon: 0 });
  });
});

describe('sortVisibleKinds', () => {
  it('orders by descending count', () => {
    const counts = { token: 1, secret: 5, api_key: 3 };
    expect(sortVisibleKinds(counts, null)).toEqual([
      'secret',
      'api_key',
      'token',
    ]);
  });

  it('breaks ties on the canonical ENTRY_KINDS order', () => {
    // Both have count 1 — secret precedes api_key in ENTRY_KINDS.
    const counts = { token: 1, secret: 1, api_key: 1 };
    expect(sortVisibleKinds(counts, null)).toEqual([
      'secret',
      'api_key',
      'token',
    ]);
  });

  it('omits kinds with zero count', () => {
    const counts = { token: 2 };
    expect(sortVisibleKinds(counts, null)).toEqual(['token']);
  });

  it('keeps the active kind visible even when its count is 0', () => {
    // User had `secret` filtered, then a search emptied that bucket.
    // The chip must remain so the user can clear the filter.
    const counts = { token: 2 };
    expect(sortVisibleKinds(counts, 'secret')).toEqual(['token', 'secret']);
  });

  it('does not double-add the active kind if it already has a count', () => {
    const counts = { secret: 3, token: 1 };
    expect(sortVisibleKinds(counts, 'secret')).toEqual(['secret', 'token']);
  });
});

describe('pickInlineKinds', () => {
  const visible = ['secret', 'api_key', 'token', 'password', 'other'] as const;

  it('returns the head of the list when nothing is active', () => {
    expect(pickInlineKinds(visible, null, 3)).toEqual([
      'secret',
      'api_key',
      'token',
    ]);
  });

  it('returns the head when the active kind is already in it', () => {
    expect(pickInlineKinds(visible, 'api_key', 3)).toEqual([
      'secret',
      'api_key',
      'token',
    ]);
  });

  it('pins the active kind into the visible slice when it would be hidden', () => {
    // `password` is at index 3, beyond cap 3. It should swap into the
    // visible slice, displacing the last regular slot.
    expect(pickInlineKinds(visible, 'password', 3)).toEqual([
      'secret',
      'api_key',
      'password',
    ]);
  });

  it('also pins the very last kind correctly', () => {
    expect(pickInlineKinds(visible, 'other', 3)).toEqual([
      'secret',
      'api_key',
      'other',
    ]);
  });

  it('returns just the active kind when cap is 1 and active is hidden', () => {
    expect(pickInlineKinds(visible, 'password', 1)).toEqual(['password']);
  });

  it('returns the head when the visible list is shorter than cap', () => {
    expect(pickInlineKinds(['secret', 'token'] as const, null, 3)).toEqual([
      'secret',
      'token',
    ]);
  });
});
