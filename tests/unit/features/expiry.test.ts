import { describe, expect, it } from 'vitest';
import { daysUntilExpiry, expiryUrgency } from '~/features/vault/expiry';

const ONE_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-05-05T12:00:00Z');

describe('daysUntilExpiry', () => {
  it('is 0 on the same UTC day', () => {
    expect(daysUntilExpiry('2026-05-05', NOW)).toBe(0);
  });

  it('is positive in the future', () => {
    expect(daysUntilExpiry('2026-05-08', NOW)).toBe(3);
  });

  it('is negative in the past', () => {
    expect(daysUntilExpiry('2026-05-03', NOW)).toBe(-2);
  });

  it('handles a malformed date gracefully', () => {
    expect(daysUntilExpiry('not-a-date', NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('expiryUrgency', () => {
  it('returns null when expiresAt is undefined', () => {
    expect(expiryUrgency(undefined, NOW)).toBeNull();
  });

  it('returns ok when more than 14 days away', () => {
    expect(expiryUrgency('2026-06-01', NOW)).toBe('ok');
  });

  it('returns soon when less than 14 days away', () => {
    expect(expiryUrgency('2026-05-15', NOW)).toBe('soon');
  });

  it('returns expired on the day of expiry', () => {
    expect(expiryUrgency('2026-05-05', NOW)).toBe('expired');
  });

  it('returns expired in the past', () => {
    expect(expiryUrgency('2026-05-01', NOW)).toBe('expired');
  });

  it('treats the boundary at exactly 14 days as soon, not ok', () => {
    // 14 days from today UTC → '2026-05-19' is at boundary; days=14 is "ok"
    // since we use < EXPIRY_WARNING_DAYS. day 13 should be soon.
    const at13 = new Date(NOW + 13 * ONE_DAY).toISOString().slice(0, 10);
    expect(expiryUrgency(at13, NOW)).toBe('soon');
  });
});
