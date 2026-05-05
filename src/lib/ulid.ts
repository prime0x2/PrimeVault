/**
 * ULID generator. SPEC §5.2.
 *
 * 26-character Crockford base32:
 *   bits 0..47   — milliseconds since Unix epoch (10 chars)
 *   bits 48..127 — randomness (16 chars)
 *
 * Two ULIDs generated in the same millisecond would have non-deterministic
 * relative order, so we keep a tiny monotonic guard: when called twice in
 * the same ms, the second call's randomness is the first's randomness + 1
 * (BigInt-incremented, then re-encoded). This makes IDs lexicographically
 * sortable by creation time, which we rely on for default ordering.
 */

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ' as const;
const TIME_LEN = 10;
const RAND_LEN = 16;
const RAND_BYTES = 10; // 80 bits

let lastTime = -1;
let lastRand: bigint = 0n;

function encodeTime(ms: number): string {
  let value = ms;
  const out = new Array<string>(TIME_LEN);
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = value % 32;
    out[i] = ENCODING[mod] as string;
    value = Math.floor(value / 32);
  }
  return out.join('');
}

function encodeRand(rand: bigint): string {
  let value = rand;
  const out = new Array<string>(RAND_LEN);
  for (let i = RAND_LEN - 1; i >= 0; i--) {
    const mod = Number(value & 31n);
    out[i] = ENCODING[mod] as string;
    value = value >> 5n;
  }
  return out.join('');
}

function randomBigInt(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(RAND_BYTES));
  let value = 0n;
  for (const b of bytes) {
    value = (value << 8n) | BigInt(b);
  }
  return value;
}

export function ulid(now: () => number = Date.now): string {
  const time = now();
  let rand: bigint;
  if (time === lastTime) {
    rand = lastRand + 1n;
  } else {
    rand = randomBigInt();
    lastTime = time;
  }
  lastRand = rand;
  return encodeTime(time) + encodeRand(rand);
}

/** Reset internal monotonic state. Tests only. */
export function _resetUlidState(): void {
  lastTime = -1;
  lastRand = 0n;
}
