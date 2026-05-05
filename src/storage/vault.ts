/**
 * High-level vault read/write with crash-safe atomic writes. SPEC §6.4.
 *
 * Layout on disk:
 *   pv:envelope       — the live envelope
 *   pv:envelope.next  — staging slot used during multi-step writes
 *
 * Atomic write protocol (in {@link writeVault}):
 *   1. set pv:envelope.next = new envelope
 *   2. set pv:envelope      = new envelope
 *   3. remove pv:envelope.next
 *
 * Crash recovery (in {@link readVault}):
 *   - If pv:envelope.next exists and parses, promote it to pv:envelope. This
 *     covers a crash after step 1 but before step 3. After step 1 the .next
 *     slot is the canonical "intended" state, so promoting it is always
 *     correct: either current is stale (crash before step 2) or current is
 *     already equal to next (crash between step 2 and step 3).
 *   - If pv:envelope.next exists but is malformed, discard it. We trust the
 *     current envelope (or treat the vault as uninitialized).
 */

import { type Envelope, parseEnvelope } from '../crypto/envelope';
import { STORAGE_KEYS, type StorageBackend } from './client';

export type VaultState =
  | { kind: 'uninitialized' }
  | { kind: 'ready'; envelope: Envelope };

/**
 * Thrown when {@link writeVault} hits a backend storage limit. The atomic
 * write protocol means the on-disk state is still consistent — the failure
 * happens *before* the canonical `pv:envelope` slot is overwritten. The
 * caller should surface a friendly "vault too large" message rather than a
 * generic "internal error."
 */
export class VaultQuotaError extends Error {
  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = 'VaultQuotaError';
  }
}

/**
 * Heuristic match for `chrome.storage.local` quota errors. The MV3 runtime
 * surfaces quota failures as plain `Error`s with messages mentioning
 * `QUOTA_BYTES_PER_ITEM` (~8KB per value) or `QUOTA_BYTES` (~10MB total).
 * This matches both forms case-insensitively so the session layer can map
 * them onto a typed UI message without a vendor-specific type.
 */
function isQuotaError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return /quota/i.test(err.message);
}

/**
 * Read the vault envelope from storage, recovering from any leftover atomic
 * write. Throws {@link import('../crypto/envelope').EnvelopeFormatError} if
 * the stored envelope is malformed and there is no recoverable `.next`.
 */
export async function readVault(backend: StorageBackend): Promise<VaultState> {
  const next = await backend.get(STORAGE_KEYS.envelopeNext);
  if (next !== undefined) {
    try {
      const recovered = parseEnvelope(next);
      await backend.set(STORAGE_KEYS.envelope, recovered);
      await backend.remove(STORAGE_KEYS.envelopeNext);
      return { kind: 'ready', envelope: recovered };
    } catch {
      await backend.remove(STORAGE_KEYS.envelopeNext);
    }
  }

  const current = await backend.get(STORAGE_KEYS.envelope);
  if (current === undefined) {
    return { kind: 'uninitialized' };
  }
  return { kind: 'ready', envelope: parseEnvelope(current) };
}

/**
 * Atomically replace the on-disk envelope. The envelope is validated with
 * {@link parseEnvelope} before the first write so that caller bugs surface
 * before any storage mutation.
 *
 * If the process crashes between any of the three storage operations, the
 * next {@link readVault} will recover.
 */
export async function writeVault(
  backend: StorageBackend,
  envelope: Envelope,
): Promise<void> {
  const validated = parseEnvelope(envelope);
  try {
    await backend.set(STORAGE_KEYS.envelopeNext, validated);
    await backend.set(STORAGE_KEYS.envelope, validated);
    await backend.remove(STORAGE_KEYS.envelopeNext);
  } catch (err) {
    if (isQuotaError(err)) {
      throw new VaultQuotaError(
        'Storage quota exceeded while writing the vault.',
        { cause: err },
      );
    }
    throw err;
  }
}

/**
 * Remove all vault keys. Used by the "reset vault" path in settings (§10).
 *
 * Intentionally only removes the envelope keys. `pv:prefs` (theme, accent,
 * auto-lock duration, etc.) is unencrypted UX state the user shouldn't have
 * to reconfigure after a reset. `pv:meta` is reserved for forward-compat
 * install-level metadata (see {@link STORAGE_KEYS}); it survives a reset
 * because "reset" means "delete the secrets I trusted you with," not
 * "delete the install." If a future migration needs to clear meta on
 * reset, it should land deliberately, not as a side effect of this fn.
 */
export async function clearVault(backend: StorageBackend): Promise<void> {
  await backend.remove(STORAGE_KEYS.envelope);
  await backend.remove(STORAGE_KEYS.envelopeNext);
}
