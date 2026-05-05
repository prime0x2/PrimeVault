/**
 * Helpers for entry expiry. SPEC §10.2: expiry warning chip is orange when
 * expiry is less than 14 days away, red when at or past expiry.
 */

export type ExpiryUrgency = 'expired' | 'soon' | 'ok';

export const EXPIRY_WARNING_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns whole days remaining (negative if past expiry). Treats both
 * inputs as date-only at UTC midnight to keep the math timezone-agnostic.
 */
export function daysUntilExpiry(
  expiresAt: string,
  now: number = Date.now(),
): number {
  const target = Date.parse(`${expiresAt}T00:00:00Z`);
  if (Number.isNaN(target)) return Number.POSITIVE_INFINITY;
  const today = Math.floor(now / MS_PER_DAY) * MS_PER_DAY;
  return Math.floor((target - today) / MS_PER_DAY);
}

export function expiryUrgency(
  expiresAt: string | undefined,
  now: number = Date.now(),
): ExpiryUrgency | null {
  if (expiresAt === undefined) return null;
  const days = daysUntilExpiry(expiresAt, now);
  if (days <= 0) return 'expired';
  if (days < EXPIRY_WARNING_DAYS) return 'soon';
  return 'ok';
}
