import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, generateIv, IV_BYTE_LENGTH } from '~/crypto/aead';

async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

const utf8 = (s: string) => new TextEncoder().encode(s);
const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);

describe('aead', () => {
  describe('generateIv', () => {
    it('returns 12 random bytes', () => {
      const a = generateIv();
      const b = generateIv();
      expect(a.byteLength).toBe(IV_BYTE_LENGTH);
      expect(b.byteLength).toBe(IV_BYTE_LENGTH);
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });
  });

  describe('encrypt / decrypt round-trip', () => {
    it('decrypts to the original plaintext', async () => {
      const key = await generateKey();
      const blob = await encrypt(key, utf8('the eagle has landed'));
      const out = await decrypt(key, blob);
      expect(fromUtf8(out)).toBe('the eagle has landed');
    });

    it('handles empty plaintext', async () => {
      const key = await generateKey();
      const blob = await encrypt(key, new Uint8Array(0));
      const out = await decrypt(key, blob);
      expect(out.byteLength).toBe(0);
    });

    it('round-trips with AAD when AAD matches', async () => {
      const key = await generateKey();
      const aad = utf8('context-v1');
      const blob = await encrypt(key, utf8('secret payload'), aad);
      const out = await decrypt(key, blob, aad);
      expect(fromUtf8(out)).toBe('secret payload');
    });

    it('produces a fresh IV every encryption', async () => {
      const key = await generateKey();
      const b1 = await encrypt(key, utf8('same plaintext'));
      const b2 = await encrypt(key, utf8('same plaintext'));
      expect(Array.from(b1.iv)).not.toEqual(Array.from(b2.iv));
      expect(Array.from(b1.ciphertext)).not.toEqual(Array.from(b2.ciphertext));
    });
  });

  describe('decrypt — failure modes', () => {
    it('rejects when the key is wrong', async () => {
      const k1 = await generateKey();
      const k2 = await generateKey();
      const blob = await encrypt(k1, utf8('payload'));
      await expect(decrypt(k2, blob)).rejects.toThrow();
    });

    it('rejects when the ciphertext was tampered with', async () => {
      const key = await generateKey();
      const blob = await encrypt(key, utf8('payload'));
      const tampered = {
        ...blob,
        ciphertext: new Uint8Array(blob.ciphertext),
      };
      tampered.ciphertext[0] = (tampered.ciphertext[0] as number) ^ 0xff;
      await expect(decrypt(key, tampered)).rejects.toThrow();
    });

    it('rejects when the IV was tampered with', async () => {
      const key = await generateKey();
      const blob = await encrypt(key, utf8('payload'));
      const tampered = { ...blob, iv: new Uint8Array(blob.iv) };
      tampered.iv[0] = (tampered.iv[0] as number) ^ 0xff;
      await expect(decrypt(key, tampered)).rejects.toThrow();
    });

    it('rejects when AAD is supplied at encrypt-time but missing at decrypt-time', async () => {
      const key = await generateKey();
      const blob = await encrypt(key, utf8('payload'), utf8('ctx-v1'));
      await expect(decrypt(key, blob)).rejects.toThrow();
    });

    it('rejects when AAD differs between encrypt and decrypt', async () => {
      const key = await generateKey();
      const blob = await encrypt(key, utf8('payload'), utf8('ctx-v1'));
      await expect(decrypt(key, blob, utf8('ctx-v2'))).rejects.toThrow();
    });
  });
});
