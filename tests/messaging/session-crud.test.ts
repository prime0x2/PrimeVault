import { beforeEach, describe, expect, it } from 'vitest';
import { MessagingError } from '../../src/messaging/protocol';
import { createSession, type Session } from '../../src/messaging/session';
import { createMemoryBackend } from '../../src/storage/client';

const TEST_ITERATIONS = 1000;

async function unlockedSession(): Promise<Session> {
  const session = createSession({
    backend: createMemoryBackend(),
    kdfIterations: TEST_ITERATIONS,
  });
  await session.setupVault('master-pw');
  return session;
}

describe('session CRUD — happy path', () => {
  let session: Session;
  beforeEach(async () => {
    session = await unlockedSession();
  });

  it('starts with an empty entry list', async () => {
    expect(await session.getEntries()).toEqual([]);
  });

  it('addEntry appends to the list and returns the created entry', async () => {
    const entry = await session.addEntry({ name: 'GitHub', value: 'ghp_x' });
    expect(entry.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(entry.name).toBe('GitHub');
    expect(entry.value).toBe('ghp_x');
    expect(entry.copyCount).toBe(0);
    expect(entry.kind).toBe('secret');
    expect(entry.tags).toEqual([]);
    expect(entry.createdAt).toBe(entry.updatedAt);

    const list = await session.getEntries();
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(entry.id);
  });

  it('deleteEntry removes the matching id and returns deleted: true', async () => {
    const a = await session.addEntry({ name: 'A', value: 'a-val' });
    await session.addEntry({ name: 'B', value: 'b-val' });
    expect(await session.deleteEntry(a.id)).toEqual({ deleted: true });
    const list = await session.getEntries();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('B');
  });

  it('deleteEntry on a missing id returns deleted: false', async () => {
    expect(await session.deleteEntry('nope')).toEqual({ deleted: false });
  });

  it('markUsed bumps copyCount and lastUsedAt', async () => {
    const created = await session.addEntry({ name: 'X', value: 'x-val' });
    const used1 = await session.markUsed(created.id);
    expect(used1.copyCount).toBe(1);
    expect(used1.lastUsedAt).toBeDefined();

    const used2 = await session.markUsed(created.id);
    expect(used2.copyCount).toBe(2);
  });

  it('markUsed on a missing id throws notFound', async () => {
    await expect(session.markUsed('nope')).rejects.toMatchObject({
      code: 'notFound',
    });
  });
});

describe('session CRUD — locked-state guards', () => {
  it('rejects getEntries / addEntry / deleteEntry / markUsed when locked', async () => {
    const session = await unlockedSession();
    session.lock();

    await expect(session.getEntries()).rejects.toMatchObject({
      code: 'locked',
    });
    await expect(
      session.addEntry({ name: 'A', value: 'v' }),
    ).rejects.toMatchObject({ code: 'locked' });
    await expect(session.deleteEntry('id')).rejects.toMatchObject({
      code: 'locked',
    });
    await expect(session.markUsed('id')).rejects.toMatchObject({
      code: 'locked',
    });
  });
});

describe('session CRUD — duplicate name', () => {
  it('rejects an addEntry whose name collides case-insensitively', async () => {
    const session = await unlockedSession();
    await session.addEntry({ name: 'GitHub', value: 'a' });
    await expect(
      session.addEntry({ name: 'github', value: 'b' }),
    ).rejects.toBeInstanceOf(MessagingError);
    await expect(
      session.addEntry({ name: 'github', value: 'b' }),
    ).rejects.toMatchObject({ code: 'duplicateName' });
  });
});

describe('session CRUD — persistence across lock/unlock', () => {
  it('reads back entries after a lock/unlock cycle', async () => {
    const backend = createMemoryBackend();
    const session = createSession({
      backend,
      kdfIterations: TEST_ITERATIONS,
    });
    await session.setupVault('pw');
    await session.addEntry({ name: 'Persisted', value: 'v' });
    session.lock();
    await session.unlock('pw');
    const list = await session.getEntries();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Persisted');
  });

  it('survives session re-instantiation (simulated SW restart)', async () => {
    const backend = createMemoryBackend();
    const s1 = createSession({ backend, kdfIterations: TEST_ITERATIONS });
    await s1.setupVault('pw');
    const created = await s1.addEntry({ name: 'Persisted', value: 'v' });

    // New session against the same backend = SW eviction + restart.
    const s2 = createSession({ backend, kdfIterations: TEST_ITERATIONS });
    expect((await s2.status()).state).toBe('locked');
    await s2.unlock('pw');
    const list = await s2.getEntries();
    expect(list[0]?.id).toBe(created.id);
  });
});
