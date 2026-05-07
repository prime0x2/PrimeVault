import { describe, expect, it } from 'vitest';
import {
  ERROR_CODES,
  MessagingError,
  messageSchema,
  vaultStatusSchema,
  wireResponseSchema,
} from '~/messaging/protocol';

describe('vaultStatusSchema', () => {
  it('accepts uninitialized', () => {
    expect(
      vaultStatusSchema.safeParse({ state: 'uninitialized' }).success,
    ).toBe(true);
  });

  it('accepts locked', () => {
    expect(vaultStatusSchema.safeParse({ state: 'locked' }).success).toBe(true);
  });

  it('accepts unlocked with expiresAt', () => {
    expect(
      vaultStatusSchema.safeParse({ state: 'unlocked', expiresAt: 1234 })
        .success,
    ).toBe(true);
  });

  it('rejects unlocked without expiresAt', () => {
    expect(vaultStatusSchema.safeParse({ state: 'unlocked' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown state', () => {
    expect(vaultStatusSchema.safeParse({ state: 'banana' }).success).toBe(
      false,
    );
  });
});

describe('messageSchema', () => {
  it('accepts every defined message kind', () => {
    expect(messageSchema.safeParse({ kind: 'getStatus' }).success).toBe(true);
    expect(
      messageSchema.safeParse({ kind: 'setupVault', password: 'pw' }).success,
    ).toBe(true);
    expect(
      messageSchema.safeParse({ kind: 'unlock', password: 'pw' }).success,
    ).toBe(true);
    expect(messageSchema.safeParse({ kind: 'lock' }).success).toBe(true);
  });

  it('rejects setupVault / unlock with empty password', () => {
    expect(
      messageSchema.safeParse({ kind: 'setupVault', password: '' }).success,
    ).toBe(false);
    expect(
      messageSchema.safeParse({ kind: 'unlock', password: '' }).success,
    ).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(messageSchema.safeParse({ kind: 'mystery' }).success).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(messageSchema.safeParse(null).success).toBe(false);
    expect(messageSchema.safeParse('hi').success).toBe(false);
  });
});

describe('wireResponseSchema', () => {
  it('accepts a successful response', () => {
    expect(
      wireResponseSchema.safeParse({
        ok: true,
        data: { state: 'locked' },
      }).success,
    ).toBe(true);
  });

  it('accepts each error code', () => {
    for (const code of ERROR_CODES) {
      expect(
        wireResponseSchema.safeParse({ ok: false, code, message: 'msg' })
          .success,
      ).toBe(true);
    }
  });

  it('rejects an unknown error code', () => {
    expect(
      wireResponseSchema.safeParse({
        ok: false,
        code: 'mystery',
        message: 'msg',
      }).success,
    ).toBe(false);
  });
});

describe('MessagingError', () => {
  it('preserves code and message', () => {
    const err = new MessagingError('wrongPassword', 'nope');
    expect(err.code).toBe('wrongPassword');
    expect(err.message).toBe('nope');
    expect(err).toBeInstanceOf(Error);
  });
});
