/**
 * PBKDF2-SHA256 key derivation. See SPEC §4.1.
 *
 * The vault's master password is stretched into a 256-bit AES-GCM key with
 * 600,000 PBKDF2 iterations (OWASP 2023 recommendation). Salt is 16 random
 * bytes generated once at vault setup and stored alongside the ciphertext.
 */

export const KDF_ALGO = 'PBKDF2-SHA256' as const;
export const DEFAULT_ITERATIONS = 600_000;
export const SALT_BYTE_LENGTH = 16;
export const AES_KEY_BIT_LENGTH = 256;

export type KdfAlgo = typeof KDF_ALGO;

export interface KdfParams {
  algo: KdfAlgo;
  iterations: number;
  salt: Uint8Array;
}

export interface DeriveKeyOptions {
  /** When true, the derived key can be exported with subtle.exportKey('raw'). */
  extractable?: boolean;
}

export const DEFAULT_KDF_DEFAULTS: Pick<KdfParams, 'algo' | 'iterations'> = {
  algo: KDF_ALGO,
  iterations: DEFAULT_ITERATIONS,
};

export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
}

/**
 * Build fresh KDF params with a new random salt and the default iteration
 * count. Use when setting up a new vault or rotating the master password.
 */
export function newKdfParams(): KdfParams {
  return {
    ...DEFAULT_KDF_DEFAULTS,
    salt: generateSalt(),
  };
}

async function importPasswordKey(password: string): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password);
  return crypto.subtle.importKey(
    'raw',
    passwordBytes as BufferSource,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey'],
  );
}

function pbkdf2Algorithm(params: KdfParams): Pbkdf2Params {
  return {
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: params.salt as BufferSource,
    iterations: params.iterations,
  };
}

/**
 * Derive an AES-GCM CryptoKey from a password.
 *
 * By default the key is non-extractable, so it cannot be read back out of
 * memory even with privileged code. Tests that need to verify against
 * known-answer vectors should use {@link deriveBytes} instead.
 */
export async function deriveAesKey(
  password: string,
  params: KdfParams,
  options: DeriveKeyOptions = {},
): Promise<CryptoKey> {
  const passwordKey = await importPasswordKey(password);
  return crypto.subtle.deriveKey(
    pbkdf2Algorithm(params),
    passwordKey,
    { name: 'AES-GCM', length: AES_KEY_BIT_LENGTH },
    options.extractable === true,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derive raw bytes from a password. Used by tests for known-answer vectors,
 * and by callers that need a non-AES output (none in v1).
 */
export async function deriveBytes(
  password: string,
  params: KdfParams,
  byteLength: number,
): Promise<Uint8Array> {
  const passwordKey = await importPasswordKey(password);
  const bits = await crypto.subtle.deriveBits(
    pbkdf2Algorithm(params),
    passwordKey,
    byteLength * 8,
  );
  return new Uint8Array(bits);
}
