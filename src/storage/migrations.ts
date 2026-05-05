/**
 * Forward-only schema migrations on the decrypted vault plaintext. SPEC §6.5.
 *
 * Migrations are keyed by the *source* schemaVersion (the version being
 * migrated FROM). When the current version bumps to N+1, the migration that
 * upgrades N → N+1 is registered under key N. The runner walks the chain
 * until it reaches {@link CURRENT_SCHEMA_VERSION}, then validates with the
 * current Zod schema.
 *
 * A vault written by a future version (schemaVersion > current) is rejected
 * rather than silently truncated — see {@link MigrationError}.
 */

import {
  CURRENT_SCHEMA_VERSION,
  parsePlaintext,
  type VaultPlaintext,
} from './schema';

export type Migration = (
  input: Record<string, unknown>,
) => Record<string, unknown>;

/**
 * Registered migrations. Empty at v1; add entries as the schema evolves.
 *
 *   migrations[1] = (v1) => ({ ...v1, schemaVersion: 2, newField: ... });
 */
export const migrations: Record<number, Migration> = {};

export class MigrationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MigrationError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSchemaVersion(value: Record<string, unknown>): number {
  const v = value.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new MigrationError(
      `Invalid schemaVersion: ${JSON.stringify(v)} (expected positive integer)`,
    );
  }
  return v;
}

/**
 * Run migrations until the plaintext reaches `targetVersion`. Returns the
 * migrated raw object without final Zod validation — callers that want
 * end-to-end "migrate + validate against current schema" should use
 * {@link migrate} instead.
 *
 * Exposed primarily so tests can exercise the chain logic with synthetic
 * migrations without mutating the module-level {@link migrations} map.
 */
export function runMigrations(
  plaintext: unknown,
  migrationMap: Record<number, Migration>,
  targetVersion: number,
): Record<string, unknown> {
  if (!isPlainObject(plaintext)) {
    throw new MigrationError('Cannot migrate: plaintext is not a plain object');
  }

  let current = plaintext;
  let version = readSchemaVersion(current);

  if (version > targetVersion) {
    throw new MigrationError(
      `Vault was written by a newer version (schemaVersion=${version}, current=${targetVersion}). Refusing to downgrade.`,
    );
  }

  while (version < targetVersion) {
    const step = migrationMap[version];
    if (!step) {
      throw new MigrationError(
        `No migration registered from schemaVersion ${version} to ${version + 1}`,
      );
    }
    const next = step(current);
    if (!isPlainObject(next)) {
      throw new MigrationError(
        `Migration from ${version} did not return an object`,
      );
    }
    const nextVersion = readSchemaVersion(next);
    if (nextVersion <= version) {
      throw new MigrationError(
        `Migration from ${version} did not advance schemaVersion (got ${nextVersion})`,
      );
    }
    current = next;
    version = nextVersion;
  }

  return current;
}

/**
 * Run the registered migration chain on a decrypted plaintext, then validate
 * the result with {@link parsePlaintext}. This is the function called on
 * every unlock (SPEC §6.5).
 */
export function migrate(plaintext: unknown): VaultPlaintext {
  const migrated = runMigrations(plaintext, migrations, CURRENT_SCHEMA_VERSION);
  return parsePlaintext(migrated);
}
