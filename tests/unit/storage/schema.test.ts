import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  type Entry,
  emptyPlaintext,
  entrySchema,
  PlaintextFormatError,
  parsePlaintext,
} from '~/storage/schema';

const validEntry = (overrides: Partial<Entry> = {}): Entry => ({
  id: '01HXX0000000000000000000VV',
  name: 'GitHub token',
  value: 'ghp_xxx',
  tags: [],
  kind: 'token',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  copyCount: 0,
  ...overrides,
});

describe('entrySchema', () => {
  it('accepts a minimal valid entry', () => {
    expect(entrySchema.safeParse(validEntry()).success).toBe(true);
  });

  it('rejects empty name', () => {
    expect(entrySchema.safeParse(validEntry({ name: '' })).success).toBe(false);
  });

  it('rejects name longer than 80 chars', () => {
    expect(
      entrySchema.safeParse(validEntry({ name: 'x'.repeat(81) })).success,
    ).toBe(false);
  });

  it('rejects empty value', () => {
    expect(entrySchema.safeParse(validEntry({ value: '' })).success).toBe(
      false,
    );
  });

  it('rejects value longer than 8192 chars', () => {
    expect(
      entrySchema.safeParse(validEntry({ value: 'x'.repeat(8193) })).success,
    ).toBe(false);
  });

  it('rejects more than 10 tags', () => {
    expect(
      entrySchema.safeParse(
        validEntry({ tags: Array(11).fill('a') as string[] }),
      ).success,
    ).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(
      entrySchema.safeParse(
        validEntry({ kind: 'banana' as unknown as Entry['kind'] }),
      ).success,
    ).toBe(false);
  });

  it('rejects a non-ISO createdAt', () => {
    expect(
      entrySchema.safeParse(validEntry({ createdAt: 'tomorrow' })).success,
    ).toBe(false);
  });

  it('accepts an ISO date-only expiresAt', () => {
    expect(
      entrySchema.safeParse(validEntry({ expiresAt: '2027-01-01' })).success,
    ).toBe(true);
  });

  it('rejects an ISO datetime in expiresAt (date-only required)', () => {
    expect(
      entrySchema.safeParse(
        validEntry({ expiresAt: '2027-01-01T00:00:00.000Z' }),
      ).success,
    ).toBe(false);
  });
});

describe('vaultPlaintextSchema / parsePlaintext', () => {
  it('accepts an empty vault', () => {
    expect(() => parsePlaintext(emptyPlaintext())).not.toThrow();
  });

  it('rejects the wrong schemaVersion', () => {
    expect(() => parsePlaintext({ schemaVersion: 2, entries: [] })).toThrow(
      PlaintextFormatError,
    );
  });

  it('accepts entries with distinct names', () => {
    expect(() =>
      parsePlaintext({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        entries: [validEntry({ name: 'A' }), validEntry({ name: 'B' })],
      }),
    ).not.toThrow();
  });

  it('rejects duplicate names (case-insensitive)', () => {
    expect(() =>
      parsePlaintext({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        entries: [
          validEntry({ id: '1', name: 'GitHub' }),
          validEntry({ id: '2', name: 'github' }),
        ],
      }),
    ).toThrow(PlaintextFormatError);
  });

  it('throws PlaintextFormatError on a non-object', () => {
    expect(() => parsePlaintext(null)).toThrow(PlaintextFormatError);
    expect(() => parsePlaintext('hi')).toThrow(PlaintextFormatError);
  });
});
