/**
 * Session: the in-memory key holder + auto-lock timer that lives in the
 * service worker. SPEC §6.3, §7.
 *
 * Lifecycle:
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
 */

import {
  decryptWithKey,
  type Envelope,
  openEnvelope,
  reseal,
  rotatePassword,
  sealEnvelope,
} from '../crypto/envelope';
import { normalizeTags } from '../lib/tags';
import { ulid } from '../lib/ulid';
import type { StorageBackend } from '../storage/client';
import { migrate } from '../storage/migrations';
import {
  type Entry,
  emptyPlaintext,
  type VaultPlaintext,
} from '../storage/schema';
import { clearVault, readVault, writeVault } from '../storage/vault';
import { type EntryInput, MessagingError, type VaultStatus } from './protocol';

export const DEFAULT_AUTO_LOCK_MS = 2 * 60 * 1000;

export type CancelTimer = () => void;
export type LockScheduler = (delayMs: number, fire: () => void) => CancelTimer;

const defaultScheduler: LockScheduler = (delayMs, fire) => {
  const id = setTimeout(fire, delayMs) as unknown as number;
  return () => clearTimeout(id);
};

export interface SessionDeps {
  backend: StorageBackend;
  /**
   * How long the SW holds the key before auto-locking. Default: 2 minutes
   * (SPEC §7.2). Pass a function to read the value dynamically (e.g. wired
   * to a prefs subscription); the function is called on every activity bump
   * so prefs changes take effect from the next message onward without
   * recreating the session. A value of `0` (or any non-positive/non-finite
   * value) disables the timer — the SW only locks when explicitly asked or
   * when Chrome tears it down.
   */
  autoLockMs?: number | (() => number);
  /** Defaults to setTimeout-based scheduler. Tests inject a fake clock. */
  schedule?: LockScheduler;
  /** Defaults to Date.now. Tests inject. */
  now?: () => number;
  /** Override iteration count for setup. Production code leaves this unset. */
  kdfIterations?: number;
}

export interface Session {
  status(): Promise<VaultStatus>;
  setupVault(password: string): Promise<VaultStatus>;
  unlock(password: string): Promise<VaultStatus>;
  lock(): VaultStatus;
  getEntries(): Promise<Entry[]>;
  addEntry(input: EntryInput): Promise<Entry>;
  updateEntry(id: string, input: EntryInput): Promise<Entry>;
  deleteEntry(id: string): Promise<{ deleted: boolean }>;
  markUsed(id: string): Promise<Entry>;
  changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<VaultStatus>;
  resetVault(): Promise<VaultStatus>;
  exportEncrypted(password: string): Promise<Envelope>;
  importEncrypted(envelope: Envelope, password: string): Promise<VaultStatus>;
  exportPlaintext(password: string): Promise<Entry[]>;
}

export function createSession(deps: SessionDeps): Session {
  const backend = deps.backend;
  // Pin the dep at construction so the narrowing survives into the
  // closure. Re-reading `deps.autoLockMs` inside the lambda would widen
  // back to `number | (() => number)`.
  const rawAutoLock = deps.autoLockMs;
  const autoLockMsProvider: () => number =
    typeof rawAutoLock === 'function'
      ? rawAutoLock
      : () => rawAutoLock ?? DEFAULT_AUTO_LOCK_MS;
  const schedule = deps.schedule ?? defaultScheduler;
  const now = deps.now ?? Date.now;

  let key: CryptoKey | null = null;
  let cancelTimer: CancelTimer | null = null;

  function clearKey(): void {
    if (cancelTimer) cancelTimer();
    cancelTimer = null;
    key = null;
  }

  /**
   * Reschedule the auto-lock timer and return the next expiry timestamp
   * (ms epoch), or `null` when auto-lock is disabled. Returning a number
   * lets the popup show a countdown / refetch when the timer fires.
   */
  function bumpActivity(): number | null {
    if (cancelTimer) cancelTimer();
    cancelTimer = null;
    const ms = autoLockMsProvider();
    if (!Number.isFinite(ms) || ms <= 0) {
      return null;
    }
    const next = now() + ms;
    cancelTimer = schedule(ms, () => {
      key = null;
      cancelTimer = null;
    });
    return next;
  }

  function nowIso(): string {
    return new Date(now()).toISOString();
  }

  /**
   * Decrypt + validate the current vault. Caller must already hold the key.
   * Returns the parsed plaintext alongside the envelope so the writer can
   * preserve KDF params/timestamps when resealing.
   */
  async function readPlaintext(): Promise<{
    envelope: Envelope;
    plaintext: VaultPlaintext;
  }> {
    if (key === null) {
      throw new MessagingError('locked', 'Vault is locked');
    }
    const state = await readVault(backend);
    if (state.kind === 'uninitialized') {
      // The vault disappeared from disk while the session held a key. This
      // is genuinely abnormal (the user wiped storage? extension was reset
      // mid-session?). Treat as locked + nuke the dangling key.
      clearKey();
      throw new MessagingError(
        'notInitialized',
        'Vault disappeared from storage',
      );
    }
    let bytes: Uint8Array;
    try {
      bytes = await decryptWithKey(state.envelope, key);
    } catch {
      throw new MessagingError(
        'corruptVault',
        'Could not decrypt the vault with the held key',
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new MessagingError(
        'corruptVault',
        'Vault plaintext is not valid JSON',
      );
    }
    let plaintext: VaultPlaintext;
    try {
      plaintext = migrate(parsed);
    } catch (err) {
      throw new MessagingError(
        'corruptVault',
        err instanceof Error
          ? `Vault failed validation: ${err.message}`
          : 'Vault failed validation',
      );
    }
    return { envelope: state.envelope, plaintext };
  }

  /**
   * Re-encrypt and atomically write a mutated plaintext using the held key.
   * Caller must validate the new plaintext shape before calling — usually
   * by going through {@link readPlaintext}, mutating, and trusting the
   * narrowed type. Final on-disk validation happens on the next read.
   */
  async function writePlaintext(
    envelope: Envelope,
    next: VaultPlaintext,
  ): Promise<void> {
    if (key === null) {
      throw new MessagingError('locked', 'Vault is locked');
    }
    const bytes = new TextEncoder().encode(JSON.stringify(next));
    const updated = await reseal(envelope, key, bytes);
    await writeVault(backend, updated);
  }

  async function status(): Promise<VaultStatus> {
    if (key !== null) {
      return { state: 'unlocked', expiresAt: bumpActivity() };
    }
    const state = await readVault(backend);
    return state.kind === 'uninitialized'
      ? { state: 'uninitialized' }
      : { state: 'locked' };
  }

  async function setupVault(password: string): Promise<VaultStatus> {
    const existing = await readVault(backend);
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
      deps.kdfIterations !== undefined
        ? { iterations: deps.kdfIterations }
        : undefined;
    const { envelope, key: derivedKey } = await sealEnvelope(
      password,
      plaintext,
      sealOptions,
    );
    await writeVault(backend, envelope);
    key = derivedKey;
    return { state: 'unlocked', expiresAt: bumpActivity() };
  }

  async function unlock(password: string): Promise<VaultStatus> {
    const state = await readVault(backend);
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(plaintextBytes));
    } catch {
      throw new MessagingError(
        'corruptVault',
        'Vault plaintext is not valid JSON',
      );
    }

    try {
      // Validates schemaVersion + entry shape. v1 has no migrations, so this
      // is just a Zod check for now. When schemaVersion bumps to 2, the
      // migrated plaintext should be re-sealed and atomic-written here.
      migrate(parsed);
    } catch (err) {
      throw new MessagingError(
        'corruptVault',
        err instanceof Error
          ? `Vault failed validation: ${err.message}`
          : 'Vault failed validation',
      );
    }

    key = derivedKey;
    return { state: 'unlocked', expiresAt: bumpActivity() };
  }

  function lock(): VaultStatus {
    clearKey();
    return { state: 'locked' };
  }

  async function getEntries(): Promise<Entry[]> {
    const { plaintext } = await readPlaintext();
    bumpActivity();
    return plaintext.entries;
  }

  async function addEntry(input: EntryInput): Promise<Entry> {
    const { envelope, plaintext } = await readPlaintext();

    const conflict = plaintext.entries.find(
      (e) => e.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (conflict !== undefined) {
      throw new MessagingError(
        'duplicateName',
        `An entry named "${conflict.name}" already exists`,
      );
    }

    const ts = nowIso();
    const entry: Entry = {
      id: ulid(now),
      name: input.name,
      value: input.value,
      ...(input.notes && input.notes.length > 0 ? { notes: input.notes } : {}),
      tags: normalizeTags(input.tags ?? []),
      // 'secret' is the neutral catchall; user can refine via the kind picker.
      kind: input.kind ?? 'secret',
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      createdAt: ts,
      updatedAt: ts,
      copyCount: 0,
    };
    const next: VaultPlaintext = {
      ...plaintext,
      entries: [...plaintext.entries, entry],
    };
    await writePlaintext(envelope, next);
    bumpActivity();
    return entry;
  }

  async function updateEntry(id: string, input: EntryInput): Promise<Entry> {
    const { envelope, plaintext } = await readPlaintext();
    const idx = plaintext.entries.findIndex((e) => e.id === id);
    const existing = idx === -1 ? undefined : plaintext.entries[idx];
    if (existing === undefined) {
      throw new MessagingError('notFound', `Entry ${id} not found`);
    }

    // Reject a rename that collides with another entry's name.
    const conflict = plaintext.entries.find(
      (e) => e.id !== id && e.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (conflict !== undefined) {
      throw new MessagingError(
        'duplicateName',
        `An entry named "${conflict.name}" already exists`,
      );
    }

    const ts = nowIso();
    // Build the updated entry. Optional fields use the input value; null
    // means "clear it"; undefined means "preserve existing".
    const updated: Entry = {
      ...existing,
      name: input.name,
      value: input.value,
      tags:
        input.tags !== undefined ? normalizeTags(input.tags) : existing.tags,
      kind: input.kind ?? existing.kind,
      updatedAt: ts,
    };
    if (input.notes === null) {
      delete (updated as { notes?: string }).notes;
    } else if (typeof input.notes === 'string' && input.notes.length > 0) {
      updated.notes = input.notes;
    } else if (input.notes === undefined) {
      // preserve existing
    } else {
      // empty string → treat as clear
      delete (updated as { notes?: string }).notes;
    }
    if (input.expiresAt === null) {
      delete (updated as { expiresAt?: string }).expiresAt;
    } else if (typeof input.expiresAt === 'string') {
      updated.expiresAt = input.expiresAt;
    }

    const entries = plaintext.entries.slice();
    entries[idx] = updated;
    await writePlaintext(envelope, { ...plaintext, entries });
    bumpActivity();
    return updated;
  }

  async function deleteEntry(id: string): Promise<{ deleted: boolean }> {
    const { envelope, plaintext } = await readPlaintext();
    const filtered = plaintext.entries.filter((e) => e.id !== id);
    if (filtered.length === plaintext.entries.length) {
      bumpActivity();
      return { deleted: false };
    }
    await writePlaintext(envelope, { ...plaintext, entries: filtered });
    bumpActivity();
    return { deleted: true };
  }

  async function markUsed(id: string): Promise<Entry> {
    const { envelope, plaintext } = await readPlaintext();
    const idx = plaintext.entries.findIndex((e) => e.id === id);
    const target = idx === -1 ? undefined : plaintext.entries[idx];
    if (target === undefined) {
      throw new MessagingError('notFound', `Entry ${id} not found`);
    }
    const ts = nowIso();
    const updated: Entry = {
      ...target,
      lastUsedAt: ts,
      copyCount: target.copyCount + 1,
      updatedAt: ts,
    };
    const entries = plaintext.entries.slice();
    entries[idx] = updated;
    await writePlaintext(envelope, { ...plaintext, entries });
    bumpActivity();
    return updated;
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
    const state = await readVault(backend);
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(plaintextBytes));
    } catch {
      throw new MessagingError(
        'corruptVault',
        'Vault plaintext is not valid JSON',
      );
    }
    try {
      migrate(parsed);
    } catch (err) {
      throw new MessagingError(
        'corruptVault',
        err instanceof Error
          ? `Vault failed validation: ${err.message}`
          : 'Vault failed validation',
      );
    }

    const rotateOptions =
      deps.kdfIterations !== undefined
        ? { iterations: deps.kdfIterations }
        : undefined;
    const { envelope: nextEnvelope, key: nextKey } = await rotatePassword(
      state.envelope,
      newPassword,
      plaintextBytes,
      rotateOptions,
    );
    await writeVault(backend, nextEnvelope);

    // Replace any in-memory key with the freshly-derived one. If the session
    // was locked before this call, this leaves the user unlocked — which is
    // the expected UX, since they just proved they know the new password
    // by setting it.
    if (cancelTimer) cancelTimer();
    cancelTimer = null;
    key = nextKey;
    return { state: 'unlocked', expiresAt: bumpActivity() };
  }

  /**
   * Wipe the encrypted vault. Preserves prefs (theme, auto-lock duration)
   * which live under separate storage keys. SPEC §4.6.
   *
   * Callable from any session state — locked or unlocked. Always returns
   * `{ state: 'uninitialized' }` so the popup re-routes to onboarding.
   */
  async function resetVault(): Promise<VaultStatus> {
    clearKey();
    await clearVault(backend);
    return { state: 'uninitialized' };
  }

  /**
   * Encrypted-backup export. SPEC §4.4: re-prompt the master password,
   * verify against on-disk ciphertext, and hand the envelope back to the
   * caller for download. The exported envelope IS the backup — anyone
   * with the master password can decrypt it; no separate "export key" is
   * derived. We don't update the session state here.
   */
  async function exportEncrypted(password: string): Promise<Envelope> {
    const state = await readVault(backend);
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(plaintextBytes));
    } catch {
      throw new MessagingError(
        'corruptVault',
        'Backup decrypted but is not valid JSON',
      );
    }
    try {
      migrate(parsed);
    } catch (err) {
      throw new MessagingError(
        'corruptVault',
        err instanceof Error
          ? `Backup failed validation: ${err.message}`
          : 'Backup failed validation',
      );
    }

    await writeVault(backend, incoming);
    if (cancelTimer) cancelTimer();
    cancelTimer = null;
    key = derivedKey;
    return { state: 'unlocked', expiresAt: bumpActivity() };
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
    const state = await readVault(backend);
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(plaintextBytes));
    } catch {
      throw new MessagingError(
        'corruptVault',
        'Vault plaintext is not valid JSON',
      );
    }
    try {
      const plaintext = migrate(parsed);
      return plaintext.entries;
    } catch (err) {
      throw new MessagingError(
        'corruptVault',
        err instanceof Error
          ? `Vault failed validation: ${err.message}`
          : 'Vault failed validation',
      );
    }
  }

  return {
    status,
    setupVault,
    unlock,
    lock,
    getEntries,
    addEntry,
    updateEntry,
    deleteEntry,
    markUsed,
    changePassword,
    resetVault,
    exportEncrypted,
    importEncrypted,
    exportPlaintext,
  };
}
