import { describe, expect, it } from 'vitest';
import {
  entryMatches,
  filterEntries,
  normalizeQuery,
} from '~/features/vault/search';
import type { Entry } from '~/storage/schema';

function makeEntry(over: Partial<Entry> = {}): Entry {
  return {
    id: '01HZZZZZZZZZZZZZZZZZZZZZZZ',
    name: 'GitHub PAT',
    value: 'ghp_xxx',
    tags: [],
    kind: 'token',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    copyCount: 0,
    ...over,
  };
}

describe('normalizeQuery', () => {
  it('trims and lowercases', () => {
    expect(normalizeQuery('  GitHub  ')).toBe('github');
  });

  it('returns empty string for whitespace-only', () => {
    expect(normalizeQuery('   ')).toBe('');
  });
});

describe('entryMatches', () => {
  it('matches everything for an empty query', () => {
    expect(entryMatches(makeEntry(), '')).toBe(true);
  });

  it('matches a substring of name, case-insensitively', () => {
    const e = makeEntry({ name: 'Stripe live key' });
    expect(entryMatches(e, 'stripe')).toBe(true);
    expect(entryMatches(e, 'live')).toBe(true);
    expect(entryMatches(e, 'KEY')).toBe(false); // caller normalizes; assume lowercased
  });

  it('matches a tag exactly (already-normalized)', () => {
    const e = makeEntry({ tags: ['work', 'github'] });
    expect(entryMatches(e, 'work')).toBe(true);
    expect(entryMatches(e, 'github')).toBe(true);
  });

  it('does not match a tag substring', () => {
    const e = makeEntry({ name: 'unrelated', tags: ['github'] });
    expect(entryMatches(e, 'git')).toBe(false);
  });

  it('does not match against the value field', () => {
    const e = makeEntry({ name: 'Foo', value: 'sk_secret' });
    expect(entryMatches(e, 'secret')).toBe(false);
  });
});

describe('filterEntries', () => {
  const entries = [
    makeEntry({ id: '1', name: 'GitHub PAT', tags: ['work'] }),
    makeEntry({ id: '2', name: 'Stripe live key', tags: ['billing'] }),
    makeEntry({ id: '3', name: 'OpenAI key', tags: ['ai', 'work'] }),
  ];

  it('returns the original array reference when query is empty', () => {
    expect(filterEntries(entries, '')).toBe(entries);
    expect(filterEntries(entries, '   ')).toBe(entries);
  });

  it('filters by name substring', () => {
    expect(filterEntries(entries, 'key').map((e) => e.id)).toEqual(['2', '3']);
  });

  it('filters by tag exact match', () => {
    expect(filterEntries(entries, 'work').map((e) => e.id)).toEqual(['1', '3']);
  });

  it('lowercases the query', () => {
    expect(filterEntries(entries, 'STRIPE').map((e) => e.id)).toEqual(['2']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterEntries(entries, 'zzz')).toEqual([]);
  });
});
