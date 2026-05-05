/**
 * Backup methods for the session: encrypted export, encrypted import,
 * plaintext export. Each one re-prompts the master password and verifies
 * it against on-disk ciphertext (SPEC §4.4) before returning anything
 * sensitive — even if the session is currently unlocked.
 */

import { type Envelope, openEnvelope } from '../crypto/envelope';
import type { Entry } from '../storage/schema';
import { readVault, writeVault } from '../storage/vault';
import { MessagingError, type VaultStatus } from './protocol';
import { decodeAndValidatePlaintext, type SessionCore } from './session-core';

export interface BackupMethods {
  exportEncrypted(password: string): Promise<Envelope>;
  importEncrypted(envelope: Envelope, password: string): Promise<VaultStatus>;
  exportPlaintext(password: string): Promise<Entry[]>;
}

export function createBackupMethods(core: SessionCore): BackupMethods {
  /**
   * Encrypted-backup export. SPEC §4.4: re-prompt the master password,
   * verify against on-disk ciphertext, and hand the envelope back to the
   * caller for download. The exported envelope IS the backup — anyone
   * with the master password can decrypt it; no separate "export key" is
   * derived. We don't update the session state here.
   */
  async function exportEncrypted(password: string): Promise<Envelope> {
    const state = await readVault(core.backend);
    if (state.kind === 'uninitialized') {
      throw new MessagingError('notInitialized', 'Vault is not initialized');
    }
    try {
      // openEnvelope throws on bad password — we only need to know if it
      // succeeded; we don't care about the plaintext bytes.
      await openEnvelope(state.envelope, password);
    } catch {
      throw new MessagingError(
        'wrongPassword',
        'Wrong password or corrupted vault',
      );
    }
    return state.envelope;
  }

  /**
   * Encrypted-backup import. Validates the envelope shape, verifies the
   * provided password decrypts it, then atomic-swaps it into local
   * storage. The session is left unlocked under the imported envelope's
   * key — the user just proved they can read it, so locking them out
   * immediately would be hostile UX.
   *
   * Failure modes:
   *  - Decrypt fails → wrongPassword (same code path as unlock).
   *  - Plaintext malformed under the imported key → corruptVault.
   */
  async function importEncrypted(
    incoming: Envelope,
    password: string,
  ): Promise<VaultStatus> {
    let plaintextBytes: Uint8Array;
    let derivedKey: CryptoKey;
    try {
      const opened = await openEnvelope(incoming, password);
      plaintextBytes = opened.plaintext;
      derivedKey = opened.key;
    } catch {
      throw new MessagingError(
        'wrongPassword',
        'Wrong password or corrupted backup',
      );
    }

    // Validate plaintext under the imported key BEFORE we overwrite local
    // storage. A bogus backup that decrypts to garbage shouldn't trash a
    // working vault.
    await decodeAndValidatePlaintext(plaintextBytes, 'backup');

    await writeVault(core.backend, incoming);
    core.clearKey();
    core.setKey(derivedKey);
    return { state: 'unlocked', expiresAt: core.bumpActivity() };
  }

  /**
   * Plaintext export. SPEC §4.4: heavily gated in the UI. Re-verifies
   * `password` and returns the decrypted entries. Caller (popup) handles
   * download formatting + warnings.
   *
   * Note: this returns the entries directly, not a wrapped backup object.
   * The popup formats the envelope (warning, exportedAt, etc.) so the
   * SW stays focused on the crypto-sensitive bit.
   */
  async function exportPlaintext(password: string): Promise<Entry[]> {
    const state = await readVault(core.backend);
    if (state.kind === 'uninitialized') {
      throw new MessagingError('notInitialized', 'Vault is not initialized');
    }
    let plaintextBytes: Uint8Array;
    try {
      const opened = await openEnvelope(state.envelope, password);
      plaintextBytes = opened.plaintext;
    } catch {
      throw new MessagingError(
        'wrongPassword',
        'Wrong password or corrupted vault',
      );
    }
    const plaintext = await decodeAndValidatePlaintext(plaintextBytes, 'vault');
    return plaintext.entries;
  }

  return { exportEncrypted, importEncrypted, exportPlaintext };
}
