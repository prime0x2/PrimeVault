/**
 * On-disk envelope for the encrypted vault. See SPEC §5.1.
 *
 * Layout:
 *   { version, kdf: { algo, iterations, salt }, cipher: { algo, iv, ciphertext },
 *     createdAt, updatedAt }
 *
 * The unencrypted `version` field is bound to the ciphertext as AES-GCM
 * additional authenticated data via {@link versionAad}. Tampering with
 * `version` after the fact will cause decryption to fail with an auth-tag
 * error — i.e. the same error as a wrong password — rather than silently
 * succeeding under a different schema interpretation.
 */

import { z } from 'zod';
import { decrypt, encrypt } from './aead';
import {
  DEFAULT_KDF_DEFAULTS,
  deriveAesKey,
  generateSalt,
  KDF_ALGO,
  type KdfParams,
} from './kdf';

export const ENVELOPE_VERSION = 1 as const;
export type EnvelopeVersion = typeof ENVELOPE_VERSION;

const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const base64String = z.string().regex(base64Pattern, 'expected base64');
const isoDateString = z.string().regex(isoDatePattern, 'expected ISO date');

export const envelopeSchema = z.object({
  version: z.literal(ENVELOPE_VERSION),
  kdf: z.object({
    algo: z.literal(KDF_ALGO),
    iterations: z.number().int().positive(),
    salt: base64String,
  }),
  cipher: z.object({
    algo: z.literal('AES-GCM'),
    iv: base64String,
    ciphertext: base64String,
  }),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export type Envelope = z.infer<typeof envelopeSchema>;

export class EnvelopeFormatError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EnvelopeFormatError';
  }
}

/**
 * Validate an arbitrary value as a well-formed Envelope.
 *
 * Returns the typed value on success. Throws {@link EnvelopeFormatError} on
 * structural failure. Does NOT verify the password or attempt decryption —
 * use {@link openEnvelope} for that.
 */
export function parseEnvelope(value: unknown): Envelope {
  const result = envelopeSchema.safeParse(value);
  if (!result.success) {
    throw new EnvelopeFormatError('Envelope failed schema validation', {
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * AAD bytes for a given envelope version. Bound to ciphertext at encryption
 * time so any later modification of `version` causes auth-tag failure.
 */
export function versionAad(version: EnvelopeVersion): Uint8Array {
  return new TextEncoder().encode(`primevault.envelope.v${version}`);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface SealOptions {
  /**
   * Override the PBKDF2 iteration count. Production code should leave this
   * unset (defaults to {@link DEFAULT_KDF_DEFAULTS}). Provided for tests
   * that would otherwise spend seconds on key derivation.
   */
  iterations?: number;
}

export interface SealResult {
  envelope: Envelope;
  key: CryptoKey;
}

export interface OpenResult {
  plaintext: Uint8Array;
  key: CryptoKey;
  /** The KDF params that were used. Caller can reuse via {@link reseal}. */
  kdf: KdfParams;
}

/**
 * Initial vault creation. Generates a fresh salt and IV, derives the key
 * from the password, and encrypts `plaintext`. Returns both the on-disk
 * envelope (to persist) and the in-memory key (to keep in the service worker
 * for subsequent in-session writes).
 */
export async function sealEnvelope(
  password: string,
  plaintext: Uint8Array,
  options: SealOptions = {},
): Promise<SealResult> {
  const kdfParams: KdfParams = {
    ...DEFAULT_KDF_DEFAULTS,
    iterations: options.iterations ?? DEFAULT_KDF_DEFAULTS.iterations,
    salt: generateSalt(),
  };
  const key = await deriveAesKey(password, kdfParams);
  const blob = await encrypt(key, plaintext, versionAad(ENVELOPE_VERSION));
  const now = nowIso();
  const envelope: Envelope = {
    version: ENVELOPE_VERSION,
    kdf: {
      algo: kdfParams.algo,
      iterations: kdfParams.iterations,
      salt: bytesToBase64(kdfParams.salt),
    },
    cipher: {
      algo: 'AES-GCM',
      iv: bytesToBase64(blob.iv),
      ciphertext: bytesToBase64(blob.ciphertext),
    },
    createdAt: now,
    updatedAt: now,
  };
  return { envelope, key };
}

/**
 * Unlock an envelope. Throws if the envelope is malformed, or if decryption
 * fails (which can mean a wrong password, a tampered envelope, or a tampered
 * `version` field — these are not distinguished, by design).
 */
export async function openEnvelope(
  envelope: Envelope,
  password: string,
): Promise<OpenResult> {
  const kdf: KdfParams = {
    algo: envelope.kdf.algo,
    iterations: envelope.kdf.iterations,
    salt: base64ToBytes(envelope.kdf.salt),
  };
  const key = await deriveAesKey(password, kdf);
  const plaintext = await decrypt(
    key,
    {
      iv: base64ToBytes(envelope.cipher.iv),
      ciphertext: base64ToBytes(envelope.cipher.ciphertext),
    },
    versionAad(envelope.version),
  );
  return { plaintext, key, kdf };
}

/**
 * Decrypt with an already-derived key (no KDF re-derivation). Use this in
 * the session for in-memory mutations: unlock derives the key once, then
 * subsequent reads call this rather than re-running PBKDF2. Throws on AAD
 * or auth-tag mismatch (i.e. tampered envelope).
 */
export async function decryptWithKey(
  envelope: Envelope,
  key: CryptoKey,
): Promise<Uint8Array> {
  return decrypt(
    key,
    {
      iv: base64ToBytes(envelope.cipher.iv),
      ciphertext: base64ToBytes(envelope.cipher.ciphertext),
    },
    versionAad(envelope.version),
  );
}

/**
 * Re-encrypt with the same KDF params and key (same password) but a fresh
 * IV. This is the in-session "save" path: after unlock, the caller holds a
 * key in memory; mutating the vault re-uses that key and only generates a
 * new IV. `createdAt` is preserved; `updatedAt` is bumped.
 */
export async function reseal(
  envelope: Envelope,
  key: CryptoKey,
  plaintext: Uint8Array,
): Promise<Envelope> {
  const blob = await encrypt(key, plaintext, versionAad(envelope.version));
  return {
    ...envelope,
    cipher: {
      algo: 'AES-GCM',
      iv: bytesToBase64(blob.iv),
      ciphertext: bytesToBase64(blob.ciphertext),
    },
    updatedAt: nowIso(),
  };
}

export interface RotatePasswordResult {
  envelope: Envelope;
  key: CryptoKey;
}

/**
 * Re-encrypt under a new password. Generates fresh KDF salt and IV.
 * `createdAt` is preserved; `updatedAt` is bumped. Caller is responsible
 * for atomic write-and-swap on disk (see SPEC §6.4).
 */
export async function rotatePassword(
  envelope: Envelope,
  newPassword: string,
  plaintext: Uint8Array,
  options: SealOptions = {},
): Promise<RotatePasswordResult> {
  const kdfParams: KdfParams = {
    ...DEFAULT_KDF_DEFAULTS,
    iterations: options.iterations ?? DEFAULT_KDF_DEFAULTS.iterations,
    salt: generateSalt(),
  };
  const key = await deriveAesKey(newPassword, kdfParams);
  const blob = await encrypt(key, plaintext, versionAad(envelope.version));
  const next: Envelope = {
    ...envelope,
    kdf: {
      algo: kdfParams.algo,
      iterations: kdfParams.iterations,
      salt: bytesToBase64(kdfParams.salt),
    },
    cipher: {
      algo: 'AES-GCM',
      iv: bytesToBase64(blob.iv),
      ciphertext: bytesToBase64(blob.ciphertext),
    },
    updatedAt: nowIso(),
  };
  return { envelope: next, key };
}
