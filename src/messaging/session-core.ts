/**
 * Internal scaffolding shared between {@link createSession}'s public methods.
 * Encapsulates the SW-resident mutable state (the in-memory key, the
 * auto-lock timer) and the read/write helpers that every method needs.
 *
 * Why this lives in its own file: the public Session interface is broken up
 * across `session.ts` (lifecycle), `session-entries.ts` (CRUD), and
 * `session-backup.ts` (export/import). Each of those needs the same key
 * management + decrypt/re-encrypt helpers. Centralising them here keeps
 * any one file from growing back into the 600-LOC monolith we just split.
 *
 * Not part of the public API.
 */

import { decryptWithKey, type Envelope, reseal } from '../crypto/envelope';
import type { StorageBackend } from '../storage/client';
import { migrate } from '../storage/migrations';
import type { VaultPlaintext } from '../storage/schema';
import { readVault, writeVault } from '../storage/vault';
import { MessagingError } from './protocol';

export const DEFAULT_AUTO_LOCK_MS = 2 * 60 * 1000;

export type CancelTimer = () => void;
export type LockScheduler = (delayMs: number, fire: () => void) => CancelTimer;

export const defaultScheduler: LockScheduler = (delayMs, fire) => {
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

export interface SessionCore {
  readonly backend: StorageBackend;
  readonly now: () => number;
  readonly kdfIterations: number | undefined;
  nowIso(): string;
  getKey(): CryptoKey | null;
  setKey(k: CryptoKey | null): void;
  /** Cancel the auto-lock timer and zero the key reference. */
  clearKey(): void;
  /**
   * Reschedule the auto-lock timer and return the next expiry timestamp
   * (ms epoch), or `null` when auto-lock is disabled.
   */
  bumpActivity(): number | null;
  /**
   * Decrypt + validate the current vault. Throws `MessagingError('locked')`
   * if no key is held. Returns the parsed plaintext alongside the envelope
   * so writers can preserve KDF params/timestamps when resealing.
   */
  readPlaintext(): Promise<{ envelope: Envelope; plaintext: VaultPlaintext }>;
  /**
   * Re-encrypt and atomically write a mutated plaintext using the held key.
   * Caller must already have validated the new shape.
   */
  writePlaintext(envelope: Envelope, next: VaultPlaintext): Promise<void>;
}

export function createSessionCore(deps: SessionDeps): SessionCore {
  const backend = deps.backend;
  // Pin the dep at construction so the narrowing survives into the closure.
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

  return {
    backend,
    now,
    kdfIterations: deps.kdfIterations,
    nowIso,
    getKey: () => key,
    setKey: (k) => {
      key = k;
    },
    clearKey,
    bumpActivity,
    readPlaintext,
    writePlaintext,
  };
}

/**
 * Decrypt + JSON-parse + migrate. Used by the lifecycle and backup flows
 * where the password is being re-verified against on-disk ciphertext and we
 * need the plaintext bytes back. Wraps every failure in the appropriate
 * MessagingError code.
 */
export async function decodeAndValidatePlaintext(
  bytes: Uint8Array,
  context: 'vault' | 'backup',
): Promise<VaultPlaintext> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new MessagingError(
      'corruptVault',
      `${context === 'vault' ? 'Vault plaintext' : 'Backup decrypted but'} is not valid JSON`,
    );
  }
  try {
    return migrate(parsed);
  } catch (err) {
    const label = context === 'vault' ? 'Vault' : 'Backup';
    throw new MessagingError(
      'corruptVault',
      err instanceof Error
        ? `${label} failed validation: ${err.message}`
        : `${label} failed validation`,
    );
  }
}
