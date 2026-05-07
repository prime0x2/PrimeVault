import { describe, expect, it } from 'vitest';
import {
  AES_KEY_BIT_LENGTH,
  DEFAULT_ITERATIONS,
  DEFAULT_KDF_DEFAULTS,
  deriveAesKey,
  deriveBytes,
  generateSalt,
  KDF_ALGO,
  newKdfParams,
  SALT_BYTE_LENGTH,
} from '~/crypto/kdf';

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function asciiSalt(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * Cross-checked PBKDF2-HMAC-SHA256 known-answer vectors. These match the
 * vectors used by RustCrypto's `pbkdf2` crate, Bouncy Castle, and Python's
 * hashlib.pbkdf2_hmac, and are derived from the structure of RFC 6070 with
 * SHA-256 substituted for SHA-1.
 */
const PBKDF2_SHA256_VECTORS: Array<{
  password: string;
  salt: string;
  iterations: number;
  dkLen: number;
  expected: string;
}> = [
  {
    password: 'password',
    salt: 'salt',
    iterations: 1,
    dkLen: 32,
    expected:
      '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b',
  },
  {
    password: 'password',
    salt: 'salt',
    iterations: 2,
    dkLen: 32,
    expected:
      'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
  },
  {
    password: 'password',
    salt: 'salt',
    iterations: 4096,
    dkLen: 32,
    expected:
      'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a',
  },
  {
    password: 'passwordPASSWORDpassword',
    salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt',
    iterations: 4096,
    dkLen: 40,
    expected:
      '348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9',
  },
];

describe('kdf', () => {
  describe('deriveBytes — known-answer vectors', () => {
    for (const v of PBKDF2_SHA256_VECTORS) {
      it(`P=${JSON.stringify(v.password)} S=${JSON.stringify(v.salt)} iter=${v.iterations}`, async () => {
        const out = await deriveBytes(
          v.password,
          {
            algo: KDF_ALGO,
            iterations: v.iterations,
            salt: asciiSalt(v.salt),
          },
          v.dkLen,
        );
        expect(hex(out)).toBe(v.expected);
      });
    }
  });

  describe('deriveAesKey', () => {
    const params = {
      algo: KDF_ALGO,
      iterations: 1000,
      salt: asciiSalt('test-salt'),
    };

    it('returns a non-extractable AES-GCM key by default', async () => {
      const key = await deriveAesKey('hunter2', params);
      expect(key.type).toBe('secret');
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.extractable).toBe(false);
      expect(key.usages.sort()).toEqual(['decrypt', 'encrypt']);
      await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    });

    it('returns an extractable key when requested', async () => {
      const key = await deriveAesKey('hunter2', params, { extractable: true });
      expect(key.extractable).toBe(true);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
      expect(raw.byteLength).toBe(AES_KEY_BIT_LENGTH / 8);
    });

    it('matches deriveBytes for the same inputs', async () => {
      const expected = await deriveBytes('hunter2', params, 32);
      const key = await deriveAesKey('hunter2', params, { extractable: true });
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
      expect(hex(raw)).toBe(hex(expected));
    });

    it('produces different keys for different passwords', async () => {
      const a = await deriveAesKey('alpha', params, { extractable: true });
      const b = await deriveAesKey('beta', params, { extractable: true });
      const aRaw = new Uint8Array(await crypto.subtle.exportKey('raw', a));
      const bRaw = new Uint8Array(await crypto.subtle.exportKey('raw', b));
      expect(hex(aRaw)).not.toBe(hex(bRaw));
    });

    it('produces different keys for different salts', async () => {
      const a = await deriveAesKey(
        'p',
        { ...params, salt: asciiSalt('salt-a') },
        { extractable: true },
      );
      const b = await deriveAesKey(
        'p',
        { ...params, salt: asciiSalt('salt-b') },
        { extractable: true },
      );
      const aRaw = new Uint8Array(await crypto.subtle.exportKey('raw', a));
      const bRaw = new Uint8Array(await crypto.subtle.exportKey('raw', b));
      expect(hex(aRaw)).not.toBe(hex(bRaw));
    });
  });

  describe('generateSalt / newKdfParams', () => {
    it('generateSalt returns 16 random bytes', () => {
      const s1 = generateSalt();
      const s2 = generateSalt();
      expect(s1.byteLength).toBe(SALT_BYTE_LENGTH);
      expect(s2.byteLength).toBe(SALT_BYTE_LENGTH);
      expect(hex(s1)).not.toBe(hex(s2));
    });

    it('newKdfParams uses the SPEC defaults', () => {
      const p = newKdfParams();
      expect(p.algo).toBe(KDF_ALGO);
      expect(p.iterations).toBe(DEFAULT_ITERATIONS);
      expect(p.salt.byteLength).toBe(SALT_BYTE_LENGTH);
      expect(DEFAULT_KDF_DEFAULTS.iterations).toBe(600_000);
    });
  });
});
