/**
 * Session: the in-memory key holder + auto-lock timer that lives in the
 * service worker. SPEC §6.3, §7.
 *
 * Lifecycle (this file):
 *   - Cold start: no key in memory. Status reads from disk to distinguish
 *     "uninitialized" from "locked".
 *   - setupVault / unlock: derive key, hold it, schedule auto-lock.
 *   - Any subsequent activity (status, CRUD calls) reschedules the
 *     auto-lock timer.
 *   - lock(): zero the key reference, cancel the timer.
 *   - Auto-lock fires: same as lock().
 *   - Service worker eviction: key is lost with the SW. Next message starts
 *     a fresh session (looks locked from the popup's POV). SPEC §6.3.
 *
 * The plaintext is NOT cached. CRUD ops decrypt-on-demand using the held
 * key — no KDF round-trip, ~1ms per call.
 *
 * Code organisation: this file owns only the lifecycle (status / setup /
 * unlock / lock / changePassword / resetVault). CRUD lives in
 * `session-entries.ts`; backup/restore in `session-backup.ts`. All three
 * share the {@link SessionCore} machinery from `session-core.ts`.
 */

import { openEnvelope, rotatePassword, sealEnvelope } from '../crypto/envelope';
import { type Entry, emptyPlaintext } from '../storage/schema';
import { clearVault, readVault, writeVault } from '../storage/vault';
import { type EntryInput, MessagingError, type VaultStatus } from './protocol';
import { type BackupMethods, createBackupMethods } from './session-backup';
import {
  createSessionCore,
  decodeAndValidatePlaintext,
  type SessionDeps,
} from './session-core';
import { createEntryMethods, type EntryMethods } from './session-entries';

export type { CancelTimer, LockScheduler, SessionDeps } from './session-core';
export { DEFAULT_AUTO_LOCK_MS } from './session-core';

export interface Session extends EntryMethods, BackupMethods {
  status(): Promise<VaultStatus>;
  setupVault(password: string): Promise<VaultStatus>;
  unlock(password: string): Promise<VaultStatus>;
  lock(): VaultStatus;
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<VaultStatus>;
  resetVault(): Promise<VaultStatus>;
}

export function createSession(deps: SessionDeps): Session {
  const core = createSessionCore(deps);
  const entries = createEntryMethods(core);
  const backup = createBackupMethods(core);

  async function status(): Promise<VaultStatus> {
    if (core.getKey() !== null) {
      return { state: 'unlocked', expiresAt: core.bumpActivity() };
    }
    const state = await readVault(core.backend);
    return state.kind === 'uninitialized'
      ? { state: 'uninitialized' }
      : { state: 'locked' };
  }

  async function setupVault(password: string): Promise<VaultStatus> {
    const existing = await readVault(core.backend);
    if (existing.kind === 'ready') {
      throw new MessagingError(
        'alreadyInitialized',
        'Vault is already initialized',
      );
    }
    const plaintext = new TextEncoder().encode(
      JSON.stringify(emptyPlaintext()),
    );
    const sealOptions =
      core.kdfIterations !== undefined
        ? { iterations: core.kdfIterations }
        : undefined;
    const { envelope, key: derivedKey } = await sealEnvelope(
      password,
      plaintext,
      sealOptions,
    );
    await writeVault(core.backend, envelope);
    core.setKey(derivedKey);
    return { state: 'unlocked', expiresAt: core.bumpActivity() };
  }

  async function unlock(password: string): Promise<VaultStatus> {
    const state = await readVault(core.backend);
    if (state.kind === 'uninitialized') {
      throw new MessagingError('notInitialized', 'Vault is not initialized');
    }

    let plaintextBytes: Uint8Array;
    let derivedKey: CryptoKey;
    try {
      const opened = await openEnvelope(state.envelope, password);
      plaintextBytes = opened.plaintext;
      derivedKey = opened.key;
    } catch {
      // Don't distinguish wrong-password from tampered-ciphertext: a real
      // attacker who tampered with the envelope can already see the ciphertext.
      throw new MessagingError(
        'wrongPassword',
        'Wrong password or corrupted vault',
      );
    }

    // Validates schemaVersion + entry shape. v1 has no migrations, so this
    // is just a Zod check for now. When schemaVersion bumps to 2, the
    // migrated plaintext should be re-sealed and atomic-written here.
    await decodeAndValidatePlaintext(plaintextBytes, 'vault');

    core.setKey(derivedKey);
    return { state: 'unlocked', expiresAt: core.bumpActivity() };
  }

  function lock(): VaultStatus {
    core.clearKey();
    return { state: 'locked' };
  }

  /**
   * Re-encrypt the vault under a new master password. Re-verifies the
   * current password against on-disk ciphertext (even if the session is
   * currently unlocked) so a stolen unlocked session can't silently rotate
   * the password without the user's consent.
   *
   * Steps (SPEC §4.5):
   *  1. Read envelope. Decrypt with `currentPassword` → plaintext bytes.
   *  2. Generate fresh salt + IV; derive new key from `newPassword`.
   *  3. Encrypt plaintext under new key. Atomic write-and-swap.
   *  4. Replace held key with the new derived key. Bump activity.
   *
   * Failure modes:
   *  - Wrong current password → `wrongPassword` (same code path as unlock).
   *  - Vault not initialized → `notInitialized`.
   *  - Plaintext malformed under the old key → `corruptVault` (rare; the
   *    AES-GCM auth tag would have caught most tampering already).
   */
  async function changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<VaultStatus> {
    const state = await readVault(core.backend);
    if (state.kind === 'uninitialized') {
      throw new MessagingError('notInitialized', 'Vault is not initialized');
    }

    let plaintextBytes: Uint8Array;
    try {
      const opened = await openEnvelope(state.envelope, currentPassword);
      plaintextBytes = opened.plaintext;
    } catch {
      throw new MessagingError(
        'wrongPassword',
        'Wrong current password or corrupted vault',
      );
    }

    // Surface validation errors before we write anything new on disk.
    await decodeAndValidatePlaintext(plaintextBytes, 'vault');

    const rotateOptions =
      core.kdfIterations !== undefined
        ? { iterations: core.kdfIterations }
        : undefined;
    const { envelope: nextEnvelope, key: nextKey } = await rotatePassword(
      state.envelope,
      newPassword,
      plaintextBytes,
      rotateOptions,
    );
    await writeVault(core.backend, nextEnvelope);

    // Replace any in-memory key with the freshly-derived one. If the session
    // was locked before this call, this leaves the user unlocked — which is
    // the expected UX, since they just proved they know the new password
    // by setting it.
    core.clearKey();
    core.setKey(nextKey);
    return { state: 'unlocked', expiresAt: core.bumpActivity() };
  }

  /**
   * Wipe the encrypted vault. Preserves prefs (theme, auto-lock duration)
   * which live under separate storage keys. SPEC §4.6.
   *
   * Callable from any session state — locked or unlocked. Always returns
   * `{ state: 'uninitialized' }` so the popup re-routes to onboarding.
   */
  async function resetVault(): Promise<VaultStatus> {
    core.clearKey();
    await clearVault(core.backend);
    return { state: 'uninitialized' };
  }

  return {
    status,
    setupVault,
    unlock,
    lock,
    changePassword,
    resetVault,
    ...entries,
    ...backup,
  };
}

// Re-exported by entrypoints/background.ts; callers can't tell the
// implementation now spans three files.
export type { Entry, EntryInput };
