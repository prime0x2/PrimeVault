import { describe, expect, it } from 'vitest';
import { createMessagingClient } from '../../src/messaging/client';
import { MessagingError, type VaultStatus } from '../../src/messaging/protocol';
import { type Handlers, handleMessage } from '../../src/messaging/server';
import { createSession } from '../../src/messaging/session';
import { createMemoryBackend } from '../../src/storage/client';

const TEST_ITERATIONS = 1000;

function fakeHandlers(overrides: Partial<Handlers> = {}): Handlers {
  const noop: VaultStatus = { state: 'locked' };
  return {
    getStatus: async () => noop,
    setupVault: async () => noop,
    unlock: async () => noop,
    lock: () => noop,
    getEntries: async () => [],
    addEntry: async () => {
      throw new Error('not stubbed');
    },
    updateEntry: async () => {
      throw new Error('not stubbed');
    },
    deleteEntry: async () => ({ deleted: false }),
    markUsed: async () => {
      throw new Error('not stubbed');
    },
    changePassword: async () => noop,
    resetVault: async () => ({ state: 'uninitialized' }),
    exportEncrypted: async () => {
      throw new Error('not stubbed');
    },
    importEncrypted: async () => noop,
    exportPlaintext: async () => [],
    scheduleClipboardClear: async () => ({ scheduled: false }),
    ...overrides,
  };
}

describe('handleMessage — dispatch', () => {
  it('routes to the matching handler and wraps the result', async () => {
    const out = await handleMessage(
      { kind: 'getStatus' },
      fakeHandlers({
        getStatus: async () => ({ state: 'unlocked', expiresAt: 42 }),
      }),
    );
    expect(out).toEqual({
      ok: true,
      data: { state: 'unlocked', expiresAt: 42 },
    });
  });

  it('passes the typed payload to the handler', async () => {
    let received: unknown;
    await handleMessage(
      { kind: 'unlock', password: 'secret' },
      fakeHandlers({
        unlock: async (req) => {
          received = req;
          return { state: 'locked' };
        },
      }),
    );
    expect(received).toEqual({ kind: 'unlock', password: 'secret' });
  });
});

describe('handleMessage — error mapping', () => {
  it('returns invalidRequest for a malformed message', async () => {
    expect(await handleMessage({ kind: 'mystery' }, fakeHandlers())).toEqual({
      ok: false,
      code: 'invalidRequest',
      message: expect.any(String),
    });
  });

  it('returns invalidRequest for a non-object payload', async () => {
    const out = await handleMessage(null, fakeHandlers());
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('invalidRequest');
  });

  it('forwards MessagingError code/message', async () => {
    const out = await handleMessage(
      { kind: 'unlock', password: 'wrong' },
      fakeHandlers({
        unlock: async () => {
          throw new MessagingError('wrongPassword', 'nope');
        },
      }),
    );
    expect(out).toEqual({
      ok: false,
      code: 'wrongPassword',
      message: 'nope',
    });
  });

  it('maps any other thrown error to internal', async () => {
    const out = await handleMessage(
      { kind: 'getStatus' },
      fakeHandlers({
        getStatus: async () => {
          throw new Error('boom');
        },
      }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe('internal');
  });
});

describe('createMessagingClient — round-trip', () => {
  it('returns the data field on ok', async () => {
    const handlers = fakeHandlers({
      getStatus: async () => ({ state: 'unlocked', expiresAt: 99 }),
    });
    const client = createMessagingClient((msg) => handleMessage(msg, handlers));
    expect(await client.send({ kind: 'getStatus' })).toEqual({
      state: 'unlocked',
      expiresAt: 99,
    });
  });

  it('throws MessagingError(code) on failure', async () => {
    const handlers = fakeHandlers({
      unlock: async () => {
        throw new MessagingError('wrongPassword', 'no');
      },
    });
    const client = createMessagingClient((msg) => handleMessage(msg, handlers));
    await expect(
      client.send({ kind: 'unlock', password: 'whatever' }),
    ).rejects.toMatchObject({ code: 'wrongPassword' });
  });

  it('throws internal on a malformed wire response', async () => {
    const client = createMessagingClient(async () => ({ totally: 'wrong' }));
    await expect(client.send({ kind: 'getStatus' })).rejects.toMatchObject({
      code: 'internal',
    });
  });
});

describe('end-to-end: client → dispatcher → session', () => {
  function wire() {
    const backend = createMemoryBackend();
    const session = createSession({
      backend,
      kdfIterations: TEST_ITERATIONS,
    });
    const handlers: Handlers = {
      getStatus: () => session.status(),
      setupVault: ({ password }) => session.setupVault(password),
      unlock: ({ password }) => session.unlock(password),
      lock: () => session.lock(),
      getEntries: () => session.getEntries(),
      addEntry: ({ input }) => session.addEntry(input),
      updateEntry: ({ id, input }) => session.updateEntry(id, input),
      deleteEntry: ({ id }) => session.deleteEntry(id),
      markUsed: ({ id }) => session.markUsed(id),
      changePassword: ({ currentPassword, newPassword }) =>
        session.changePassword(currentPassword, newPassword),
      resetVault: () => session.resetVault(),
      exportEncrypted: ({ password }) => session.exportEncrypted(password),
      importEncrypted: ({ envelope, password }) =>
        session.importEncrypted(envelope, password),
      exportPlaintext: ({ password }) => session.exportPlaintext(password),
      scheduleClipboardClear: () => ({ scheduled: false }),
    };
    const client = createMessagingClient((msg) => handleMessage(msg, handlers));
    return { backend, client };
  }

  it('walks uninitialized → setupVault → lock → unlock end-to-end', async () => {
    const { client } = wire();

    expect(await client.send({ kind: 'getStatus' })).toEqual({
      state: 'uninitialized',
    });

    const setup = await client.send({
      kind: 'setupVault',
      password: 'master-pw',
    });
    expect(setup.state).toBe('unlocked');

    expect(await client.send({ kind: 'lock' })).toEqual({ state: 'locked' });

    const unlocked = await client.send({
      kind: 'unlock',
      password: 'master-pw',
    });
    expect(unlocked.state).toBe('unlocked');
  });

  it('surfaces wrong-password as MessagingError(wrongPassword) at the popup', async () => {
    const { client } = wire();
    await client.send({ kind: 'setupVault', password: 'right' });
    await client.send({ kind: 'lock' });

    await expect(
      client.send({ kind: 'unlock', password: 'wrong' }),
    ).rejects.toMatchObject({ code: 'wrongPassword' });
  });
});
