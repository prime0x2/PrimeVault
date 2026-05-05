import { describe, expect, it } from 'vitest';
import {
  ENVELOPE_VERSION,
  EnvelopeFormatError,
  openEnvelope,
  parseEnvelope,
  reseal,
  rotatePassword,
  sealEnvelope,
  versionAad,
} from '../../src/crypto/envelope';

const utf8 = (s: string) => new TextEncoder().encode(s);
const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b);

const TEST_ITERATIONS = 1000;

describe('envelope', () => {
  describe('seal + open round-trip', () => {
    it('returns the original plaintext', async () => {
      const { envelope } = await sealEnvelope(
        'correct horse battery staple',
        utf8('{"entries":[]}'),
        { iterations: TEST_ITERATIONS },
      );
      const { plaintext } = await openEnvelope(
        envelope,
        'correct horse battery staple',
      );
      expect(fromUtf8(plaintext)).toBe('{"entries":[]}');
    });

    it('produces an envelope that round-trips through JSON.stringify', async () => {
      const { envelope } = await sealEnvelope('pw', utf8('hello'), {
        iterations: TEST_ITERATIONS,
      });
      const reparsed = parseEnvelope(JSON.parse(JSON.stringify(envelope)));
      const { plaintext } = await openEnvelope(reparsed, 'pw');
      expect(fromUtf8(plaintext)).toBe('hello');
    });

    it('writes the SPEC version, default algo, and base64 fields', async () => {
      const { envelope } = await sealEnvelope('pw', utf8('hi'), {
        iterations: TEST_ITERATIONS,
      });
      expect(envelope.version).toBe(ENVELOPE_VERSION);
      expect(envelope.kdf.algo).toBe('PBKDF2-SHA256');
      expect(envelope.cipher.algo).toBe('AES-GCM');
      expect(envelope.kdf.salt).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(envelope.cipher.iv).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(envelope.cipher.ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(new Date(envelope.createdAt).toISOString()).toBe(
        envelope.createdAt,
      );
    });
  });

  describe('open — failure modes', () => {
    it('throws on the wrong password', async () => {
      const { envelope } = await sealEnvelope('right', utf8('payload'), {
        iterations: TEST_ITERATIONS,
      });
      await expect(openEnvelope(envelope, 'wrong')).rejects.toThrow();
    });

    it('throws if the ciphertext was tampered with', async () => {
      const { envelope } = await sealEnvelope('pw', utf8('payload'), {
        iterations: TEST_ITERATIONS,
      });
      const tampered = {
        ...envelope,
        cipher: {
          ...envelope.cipher,
          // flip a bit by replacing the first base64 char
          ciphertext: `${
            envelope.cipher.ciphertext[0] === 'A' ? 'B' : 'A'
          }${envelope.cipher.ciphertext.slice(1)}`,
        },
      };
      await expect(openEnvelope(tampered, 'pw')).rejects.toThrow();
    });

    it('throws if the IV was tampered with', async () => {
      const { envelope } = await sealEnvelope('pw', utf8('payload'), {
        iterations: TEST_ITERATIONS,
      });
      const tampered = {
        ...envelope,
        cipher: {
          ...envelope.cipher,
          iv: `${
            envelope.cipher.iv[0] === 'A' ? 'B' : 'A'
          }${envelope.cipher.iv.slice(1)}`,
        },
      };
      await expect(openEnvelope(tampered, 'pw')).rejects.toThrow();
    });
  });

  describe('version is bound as AAD', () => {
    it('versionAad encodes a stable, version-specific byte string', () => {
      expect(fromUtf8(versionAad(ENVELOPE_VERSION))).toBe(
        `primevault.envelope.v${ENVELOPE_VERSION}`,
      );
    });
  });

  describe('parseEnvelope', () => {
    it('throws EnvelopeFormatError on a malformed object', () => {
      expect(() => parseEnvelope({})).toThrow(EnvelopeFormatError);
      expect(() => parseEnvelope({ version: 2 })).toThrow(EnvelopeFormatError);
      expect(() =>
        parseEnvelope({
          version: 1,
          kdf: { algo: 'PBKDF2-SHA256', iterations: 1, salt: 'not!base64!' },
          cipher: { algo: 'AES-GCM', iv: 'AA', ciphertext: 'AA' },
          createdAt: 'not-a-date',
          updatedAt: 'not-a-date',
        }),
      ).toThrow(EnvelopeFormatError);
    });

    it('returns a typed envelope on a well-formed object', async () => {
      const { envelope } = await sealEnvelope('pw', utf8('x'), {
        iterations: TEST_ITERATIONS,
      });
      const out = parseEnvelope(JSON.parse(JSON.stringify(envelope)));
      expect(out.version).toBe(ENVELOPE_VERSION);
    });
  });

  describe('reseal', () => {
    it('re-encrypts under the same key with a new IV and preserves createdAt', async () => {
      const { envelope: env1, key } = await sealEnvelope(
        'pw',
        utf8('initial'),
        { iterations: TEST_ITERATIONS },
      );
      // small delay so updatedAt actually advances at ms granularity
      await new Promise((r) => setTimeout(r, 5));
      const env2 = await reseal(env1, key, utf8('updated'));

      expect(env2.createdAt).toBe(env1.createdAt);
      expect(env2.updatedAt >= env1.updatedAt).toBe(true);
      expect(env2.kdf).toEqual(env1.kdf); // same salt + iterations
      expect(env2.cipher.iv).not.toBe(env1.cipher.iv);

      const { plaintext } = await openEnvelope(env2, 'pw');
      expect(fromUtf8(plaintext)).toBe('updated');
    });
  });

  describe('rotatePassword', () => {
    it('opens with the new password and rejects the old one', async () => {
      const { envelope: env1 } = await sealEnvelope('old-pw', utf8('payload'), {
        iterations: TEST_ITERATIONS,
      });
      const { envelope: env2 } = await rotatePassword(
        env1,
        'new-pw',
        utf8('payload'),
        { iterations: TEST_ITERATIONS },
      );

      const { plaintext } = await openEnvelope(env2, 'new-pw');
      expect(fromUtf8(plaintext)).toBe('payload');
      await expect(openEnvelope(env2, 'old-pw')).rejects.toThrow();
    });

    it('uses a fresh salt', async () => {
      const { envelope: env1 } = await sealEnvelope('a', utf8('p'), {
        iterations: TEST_ITERATIONS,
      });
      const { envelope: env2 } = await rotatePassword(env1, 'b', utf8('p'), {
        iterations: TEST_ITERATIONS,
      });
      expect(env2.kdf.salt).not.toBe(env1.kdf.salt);
    });
  });
});
