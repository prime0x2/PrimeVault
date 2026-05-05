import { describe, expect, it } from 'vitest';
import {
  type Migration,
  MigrationError,
  migrate,
  migrations,
  runMigrations,
} from '../../src/storage/migrations';
import {
  CURRENT_SCHEMA_VERSION,
  emptyPlaintext,
  PlaintextFormatError,
} from '../../src/storage/schema';

describe('migrate (integrated)', () => {
  it('passes an already-current empty plaintext through unchanged', () => {
    const out = migrate(emptyPlaintext());
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.entries).toEqual([]);
  });

  it('throws on a missing schemaVersion', () => {
    expect(() => migrate({ entries: [] })).toThrow(MigrationError);
  });

  it('throws on a non-numeric schemaVersion', () => {
    expect(() => migrate({ schemaVersion: 'one', entries: [] })).toThrow(
      MigrationError,
    );
  });

  it('throws when given a vault from a future version', () => {
    expect(() =>
      migrate({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, entries: [] }),
    ).toThrow(MigrationError);
  });

  it('throws PlaintextFormatError when the migrated result fails Zod validation', () => {
    expect(() =>
      migrate({
        schemaVersion: CURRENT_SCHEMA_VERSION,
        entries: 'not-an-array',
      }),
    ).toThrow(PlaintextFormatError);
  });

  it('starts with no registered migrations at v1', () => {
    expect(Object.keys(migrations)).toEqual([]);
  });
});

describe('runMigrations (chain logic)', () => {
  it('applies a single registered migration to advance one version', () => {
    const fakeMigrations: Record<number, Migration> = {
      1: (v) => ({ ...v, schemaVersion: 2, addedField: 'hello' }),
    };
    const out = runMigrations(
      { schemaVersion: 1, entries: [] },
      fakeMigrations,
      2,
    );
    expect(out.schemaVersion).toBe(2);
    expect(out.addedField).toBe('hello');
  });

  it('chains multiple migrations in order', () => {
    const calls: number[] = [];
    const fakeMigrations: Record<number, Migration> = {
      1: (v) => {
        calls.push(1);
        return { ...v, schemaVersion: 2 };
      },
      2: (v) => {
        calls.push(2);
        return { ...v, schemaVersion: 3 };
      },
      3: (v) => {
        calls.push(3);
        return { ...v, schemaVersion: 4 };
      },
    };
    const out = runMigrations(
      { schemaVersion: 1, entries: [] },
      fakeMigrations,
      4,
    );
    expect(calls).toEqual([1, 2, 3]);
    expect(out.schemaVersion).toBe(4);
  });

  it('throws when a migration in the chain is missing', () => {
    const fakeMigrations: Record<number, Migration> = {
      1: (v) => ({ ...v, schemaVersion: 2 }),
      // gap: no migration for 2 → 3
    };
    expect(() =>
      runMigrations({ schemaVersion: 1, entries: [] }, fakeMigrations, 3),
    ).toThrow(MigrationError);
  });

  it('throws if a migration fails to advance schemaVersion', () => {
    const fakeMigrations: Record<number, Migration> = {
      1: (v) => ({ ...v, schemaVersion: 1 }), // didn't bump
    };
    expect(() =>
      runMigrations({ schemaVersion: 1, entries: [] }, fakeMigrations, 2),
    ).toThrow(MigrationError);
  });

  it('throws if a migration returns a non-object', () => {
    const fakeMigrations: Record<number, Migration> = {
      1: () => 'oops' as unknown as Record<string, unknown>,
    };
    expect(() =>
      runMigrations({ schemaVersion: 1, entries: [] }, fakeMigrations, 2),
    ).toThrow(MigrationError);
  });

  it('refuses to downgrade when source version is greater than target', () => {
    expect(() => runMigrations({ schemaVersion: 5 }, {}, 2)).toThrow(
      MigrationError,
    );
  });

  it('rejects non-object input', () => {
    expect(() => runMigrations(null, {}, 1)).toThrow(MigrationError);
    expect(() => runMigrations([], {}, 1)).toThrow(MigrationError);
    expect(() => runMigrations(42, {}, 1)).toThrow(MigrationError);
  });
});
