import { describe, expect, it } from 'vitest';
import { validateSetup } from '../../src/features/unlock/validation';

describe('validateSetup', () => {
  it('rejects passwords shorter than the minimum', () => {
    expect(
      validateSetup({ password: 'short', confirm: 'short', score: 4 }),
    ).toEqual({ ok: false, reason: 'tooShort' });
  });

  it('reports evaluating when length is fine but score not yet computed', () => {
    expect(
      validateSetup({
        password: 'long-enough-password',
        confirm: 'long-enough-password',
        score: null,
      }),
    ).toEqual({ ok: false, reason: 'evaluating' });
  });

  it('rejects scores below the SPEC minimum (3 of 4)', () => {
    expect(
      validateSetup({
        password: 'long-enough-password',
        confirm: 'long-enough-password',
        score: 2,
      }),
    ).toEqual({ ok: false, reason: 'tooWeak' });
  });

  it('rejects when confirm does not match', () => {
    expect(
      validateSetup({
        password: 'long-enough-password',
        confirm: 'long-enough-passworD',
        score: 4,
      }),
    ).toEqual({ ok: false, reason: 'mismatch' });
  });

  it('passes when length, score, and confirm all check out', () => {
    expect(
      validateSetup({
        password: 'long-enough-password',
        confirm: 'long-enough-password',
        score: 3,
      }),
    ).toEqual({ ok: true });
  });

  it('priority: length is checked before score', () => {
    expect(
      validateSetup({ password: 'short', confirm: 'short', score: 0 }),
    ).toEqual({ ok: false, reason: 'tooShort' });
  });

  it('priority: score is checked before confirm', () => {
    expect(
      validateSetup({
        password: 'long-enough-password',
        confirm: 'different',
        score: 1,
      }),
    ).toEqual({ ok: false, reason: 'tooWeak' });
  });
});
