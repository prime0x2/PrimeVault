/**
 * Backup file formats. SPEC §10/§4.4.
 *
 * Two file formats:
 *  - "primevault-encrypted-backup" — wraps the on-disk envelope; safe to
 *    store offsite. Reading requires the master password the file was
 *    exported with.
 *  - "primevault-plaintext-backup" — decrypted entries in plain JSON.
 *    Heavily gated in the UI (re-prompt + "I understand" checkbox); the
 *    file itself carries a warning field for anyone who finds it later.
 *
 * The format/version markers exist so future changes (e.g. adding a
 * compression layer or migrating envelope shape) can be detected and
 * either upgraded or refused without guessing.
 */

import { z } from 'zod';
import { envelopeSchema } from '../../crypto/envelope';
import { entrySchema } from '../../storage/schema';

export const ENCRYPTED_FORMAT = 'primevault-encrypted-backup' as const;
export const PLAINTEXT_FORMAT = 'primevault-plaintext-backup' as const;
export const BACKUP_FORMAT_VERSION = 1 as const;

const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/);

export const encryptedBackupSchema = z.object({
  format: z.literal(ENCRYPTED_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: isoDateTime,
  envelope: envelopeSchema,
});

export type EncryptedBackup = z.infer<typeof encryptedBackupSchema>;

export const plaintextBackupSchema = z.object({
  format: z.literal(PLAINTEXT_FORMAT),
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: isoDateTime,
  warning: z.string(),
  schemaVersion: z.number().int().positive(),
  entries: z.array(entrySchema),
});

export type PlaintextBackup = z.infer<typeof plaintextBackupSchema>;

export class BackupFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BackupFormatError';
  }
}

export function parseEncryptedBackup(value: unknown): EncryptedBackup {
  const result = encryptedBackupSchema.safeParse(value);
  if (!result.success) {
    throw new BackupFormatError(
      'Not a valid PrimeVault encrypted backup file',
      { cause: result.error },
    );
  }
  return result.data;
}

/** Conventional download filename for a fresh backup. */
export function backupFilename(
  kind: 'encrypted' | 'plaintext',
  date: Date = new Date(),
): string {
  const stamp = date.toISOString().slice(0, 10);
  const suffix = kind === 'encrypted' ? 'backup' : 'plaintext-EXPORT';
  return `primevault-${stamp}-${suffix}.json`;
}
