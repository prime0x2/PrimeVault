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
  await backend.set(STORAGE_KEYS.envelopeNext, validated);
  await backend.set(STORAGE_KEYS.envelope, validated);
  await backend.remove(STORAGE_KEYS.envelopeNext);
}

/**
 * Remove all vault keys. Used by the "reset vault" path in settings (§10).
 * Does NOT touch prefs or meta.
 */
export async function clearVault(backend: StorageBackend): Promise<void> {
  await backend.remove(STORAGE_KEYS.envelope);
  await backend.remove(STORAGE_KEYS.envelopeNext);
}
