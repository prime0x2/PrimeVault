import { afterEach, describe, expect, it } from 'vitest';
import { _resetUlidState, ulid } from '../../src/lib/ulid';

afterEach(() => {
  _resetUlidState();
});

describe('ulid', () => {
  it('returns a 26-character string', () => {
    expect(ulid()).toHaveLength(26);
  });

  it('uses Crockford base32 alphabet (no I, L, O, U)', () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('encodes the timestamp in the first 10 characters', () => {
    const id1 = ulid(() => 0);
    expect(id1.slice(0, 10)).toBe('0000000000');

    const id2 = ulid(() => 1234567890123);
    // Re-decode time prefix back to ms.
    const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    let ms = 0;
    for (const c of id2.slice(0, 10)) ms = ms * 32 + alphabet.indexOf(c);
    expect(ms).toBe(1234567890123);
  });

  it('produces lexicographically sortable IDs across times', () => {
    const a = ulid(() => 1000);
    const b = ulid(() => 2000);
    const c = ulid(() => 3000);
    expect([c, a, b].sort()).toEqual([a, b, c]);
  });

  it('is monotonic within the same millisecond', () => {
    const fixedNow = () => 1700000000000;
    const ids = Array.from({ length: 50 }, () => ulid(fixedNow));
    for (let i = 1; i < ids.length; i++) {
      const prev = ids[i - 1];
      const curr = ids[i];
      if (prev === undefined || curr === undefined) {
        throw new Error('test setup: ids should be defined');
      }
      expect(curr > prev).toBe(true);
    }
  });

  it('produces unique IDs across different milliseconds', () => {
    let t = 1000;
    const ids = new Set(
      Array.from({ length: 100 }, () => {
        t++;
        return ulid(() => t);
      }),
    );
    expect(ids.size).toBe(100);
  });
});
