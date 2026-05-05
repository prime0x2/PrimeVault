/**
 * AES-256-GCM authenticated encryption. See SPEC §4.2.
 *
 * AES-GCM is misuse-resistant in one direction (any auth-tag failure is fatal,
 * which is exactly the property we use for password verification) but
 * brittle in the other: reusing an (key, iv) pair leaks plaintext. We
 * therefore generate a fresh 12-byte random IV on every encryption.
 */

export const AEAD_ALGO = 'AES-GCM' as const;
export const IV_BYTE_LENGTH = 12;

export type AeadAlgo = typeof AEAD_ALGO;

export interface EncryptedBlob {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export function generateIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
}

function gcmAlgorithm(iv: Uint8Array, aad?: Uint8Array): AesGcmParams {
  const params: AesGcmParams = { name: AEAD_ALGO, iv: iv as BufferSource };
  if (aad !== undefined) {
    params.additionalData = aad as BufferSource;
  }
  return params;
}

/**
 * Encrypt `plaintext` under `key`. A fresh random IV is generated and
 * returned alongside the ciphertext; the caller is responsible for
 * persisting both.
 *
 * `aad` (additional authenticated data) is authenticated but not encrypted.
 * It is bound to the ciphertext: any later change to the AAD will cause
 * decryption to fail. Callers may pass `undefined` if they have no AAD.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<EncryptedBlob> {
  const iv = generateIv();
  const ciphertext = await crypto.subtle.encrypt(
    gcmAlgorithm(iv, aad),
    key,
    plaintext as BufferSource,
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

/**
 * Decrypt `blob` under `key`. Throws if the auth tag does not verify, which
 * happens when the key is wrong, the ciphertext was tampered with, or the
 * AAD does not match what was supplied at encryption time.
 *
 * Callers should treat any thrown error as "wrong password / corrupted
 * vault" without trying to distinguish further — distinguishing would leak
 * information.
 */
export async function decrypt(
  key: CryptoKey,
  blob: EncryptedBlob,
  aad?: Uint8Array,
): Promise<Uint8Array> {
  const result = await crypto.subtle.decrypt(
    gcmAlgorithm(blob.iv, aad),
    key,
    blob.ciphertext as BufferSource,
  );
  return new Uint8Array(result);
}
