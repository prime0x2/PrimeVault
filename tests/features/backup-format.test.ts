import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  BackupFormatError,
  backupFilename,
  ENCRYPTED_FORMAT,
  PLAINTEXT_FORMAT,
  parseEncryptedBackup,
} from '../../src/features/backup/format';

const VALID_ENVELOPE = {
  version: 1 as const,
  kdf: {
    algo: 'PBKDF2-SHA256' as const,
    iterations: 600_000,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  },
  cipher: {
    algo: 'AES-GCM' as const,
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'AA==',
  },
  createdAt: '2026-05-01T00:00:00Z',
  updatedAt: '2026-05-01T00:00:00Z',
};

describe('parseEncryptedBackup', () => {
  it('parses a well-formed file', () => {
    const file = {
      format: ENCRYPTED_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: '2026-05-05T12:00:00Z',
      envelope: VALID_ENVELOPE,
    };
    const parsed = parseEncryptedBackup(file);
    expect(parsed.envelope.version).toBe(1);
  });

  it('rejects a wrong format marker', () => {
    expect(() =>
      parseEncryptedBackup({
        format: 'something-else',
        formatVersion: 1,
        exportedAt: '2026-05-05T12:00:00Z',
        envelope: VALID_ENVELOPE,
      }),
    ).toThrow(BackupFormatError);
  });

  it('rejects a wrong formatVersion', () => {
    expect(() =>
      parseEncryptedBackup({
        format: ENCRYPTED_FORMAT,
        formatVersion: 99,
        exportedAt: '2026-05-05T12:00:00Z',
        envelope: VALID_ENVELOPE,
      }),
    ).toThrow(BackupFormatError);
  });

  it('rejects a malformed envelope', () => {
    expect(() =>
      parseEncryptedBackup({
        format: ENCRYPTED_FORMAT,
        formatVersion: 1,
        exportedAt: '2026-05-05T12:00:00Z',
        envelope: { not: 'an envelope' },
      }),
    ).toThrow(BackupFormatError);
  });

  it('rejects entirely unrelated input', () => {
    expect(() => parseEncryptedBackup(null)).toThrow();
    expect(() => parseEncryptedBackup('a string')).toThrow();
    expect(() => parseEncryptedBackup(42)).toThrow();
  });
});

describe('backupFilename', () => {
  it('emits a stable date-stamped name for encrypted backups', () => {
    const date = new Date('2026-05-05T12:00:00Z');
    expect(backupFilename('encrypted', date)).toBe(
      'primevault-2026-05-05-backup.json',
    );
  });

  it('marks plaintext exports loudly in the filename', () => {
    const date = new Date('2026-05-05T12:00:00Z');
    expect(backupFilename('plaintext', date)).toBe(
      'primevault-2026-05-05-plaintext-EXPORT.json',
    );
  });
});

describe('format markers', () => {
  it('exports the literal strings actually used in files', () => {
    expect(ENCRYPTED_FORMAT).toBe('primevault-encrypted-backup');
    expect(PLAINTEXT_FORMAT).toBe('primevault-plaintext-backup');
    expect(BACKUP_FORMAT_VERSION).toBe(1);
  });
});
