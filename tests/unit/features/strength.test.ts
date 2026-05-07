import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetStrengthLoader,
  loadStrengthScorer,
  scorePassword,
} from '~/features/unlock/strength';

afterEach(() => {
  _resetStrengthLoader();
});

describe('strength', () => {
  it('scores a known weak password as 0–1', async () => {
    const result = await scorePassword('password');
    expect(result.score).toBeLessThanOrEqual(1);
    expect(typeof result.crackTime).toBe('string');
  });

  it('scores a long random-ish password as 3 or 4', async () => {
    const result = await scorePassword('Tr0ub4dor&3-correct-horse-battery');
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('reuses the same loader on subsequent calls (lazy load is one-shot)', async () => {
    const a = loadStrengthScorer();
    const b = loadStrengthScorer();
    expect(a).toBe(b);
  });

  it('reloads after _resetStrengthLoader', async () => {
    const a = loadStrengthScorer();
    _resetStrengthLoader();
    const b = loadStrengthScorer();
    expect(a).not.toBe(b);
  });
});
