/**
 * Zod schemas for the decrypted vault plaintext. See SPEC §5.2.
 *
 * The encrypted envelope's schema lives in `crypto/envelope.ts`; this module
 * is for the *inner* shape — what the user's secrets actually look like in
 * memory after decrypt. The two schemas evolve independently:
 * `envelope.version` bumps on on-disk format changes, `schemaVersion` here
 * bumps on entry-shape changes.
 */

import { z } from 'zod';

export const ENTRY_KINDS = [
  'secret',
  'api_key',
  'token',
  'password',
  'other',
] as const;

export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_SCOPES = ['personal', 'work'] as const;

export type EntryScope = (typeof ENTRY_SCOPES)[number];

const isoDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const isoDateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const isoDateTime = z
  .string()
  .regex(isoDateTimePattern, 'expected ISO datetime');
const isoDateOnly = z.string().regex(isoDateOnlyPattern, 'expected ISO date');

export const entrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  value: z.string().min(1).max(8192),
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(24)).max(10),
  kind: z.enum(ENTRY_KINDS),
  scope: z.enum(ENTRY_SCOPES).optional(),
  expiresAt: isoDateOnly.optional(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  lastUsedAt: isoDateTime.optional(),
  copyCount: z.number().int().nonnegative(),
});

export type Entry = z.infer<typeof entrySchema>;

export const CURRENT_SCHEMA_VERSION = 1 as const;
export type SchemaVersion = typeof CURRENT_SCHEMA_VERSION;

export const vaultPlaintextSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  entries: z.array(entrySchema).refine(
    (entries) => {
      const names = entries.map((e) => e.name.toLowerCase());
      return new Set(names).size === names.length;
    },
    { message: 'entry names must be unique (case-insensitive)' },
  ),
});

export type VaultPlaintext = z.infer<typeof vaultPlaintextSchema>;

export class PlaintextFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PlaintextFormatError';
  }
}

/**
 * Validate an arbitrary value as the current vault plaintext shape. Throws
 * {@link PlaintextFormatError} on schema failure. Does NOT run migrations —
 * see {@link migrate} in `migrations.ts` for that.
 */
export function parsePlaintext(value: unknown): VaultPlaintext {
  const result = vaultPlaintextSchema.safeParse(value);
  if (!result.success) {
    throw new PlaintextFormatError('Vault plaintext failed schema validation', {
      cause: result.error,
    });
  }
  return result.data;
}

/** A fresh, empty vault plaintext for new installs. */
export function emptyPlaintext(): VaultPlaintext {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, entries: [] };
}
