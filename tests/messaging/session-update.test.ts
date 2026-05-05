import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../../src/messaging/session';
import { createMemoryBackend } from '../../src/storage/client';

const TEST_ITERATIONS = 1000;

async function unlocked(): Promise<Session> {
  const session = createSession({
    backend: createMemoryBackend(),
    kdfIterations: TEST_ITERATIONS,
  });
  await session.setupVault('pw');
  return session;
}

describe('addEntry — extended fields', () => {
  it('persists notes, normalized tags, kind, and expiresAt', async () => {
    const session = await unlocked();
    const entry = await session.addEntry({
      name: 'GitHub PAT',
      value: 'ghp_x',
      notes: 'Personal repo access',
      tags: ['Work', '  GitHub  ', 'work'], // dup + casing + whitespace
      kind: 'token',
      expiresAt: '2027-06-01',
    });
    expect(entry.notes).toBe('Personal repo access');
    expect(entry.tags).toEqual(['work', 'github']);
    expect(entry.kind).toBe('token');
    expect(entry.expiresAt).toBe('2027-06-01');
  });

  it('omits absent optional fields rather than storing empty strings', async () => {
    const session = await unlocked();
    const entry = await session.addEntry({ name: 'Bare', value: 'v' });
    expect(entry.notes).toBeUndefined();
    expect(entry.expiresAt).toBeUndefined();
    expect(entry.tags).toEqual([]);
    expect(entry.kind).toBe('secret');
  });
});

describe('updateEntry — happy path', () => {
  let session: Session;
  beforeEach(async () => {
    session = await unlocked();
  });

  it('updates name and value, preserves createdAt, bumps updatedAt', async () => {
    const created = await session.addEntry({ name: 'Old', value: 'v1' });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await session.updateEntry(created.id, {
      name: 'New',
      value: 'v2',
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe('New');
    expect(updated.value).toBe('v2');
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it('preserves copyCount and lastUsedAt across an update', async () => {
    const created = await session.addEntry({ name: 'X', value: 'v' });
    await session.markUsed(created.id);
    const used = await session.markUsed(created.id);
    const updated = await session.updateEntry(created.id, {
      name: 'X',
      value: 'v2',
    });
    expect(updated.copyCount).toBe(used.copyCount);
    expect(updated.lastUsedAt).toBe(used.lastUsedAt);
  });

  it('clears notes when input.notes is null; preserves when undefined', async () => {
    const created = await session.addEntry({
      name: 'A',
      value: 'v',
      notes: 'original',
    });

    const preserved = await session.updateEntry(created.id, {
      name: 'A',
      value: 'v',
      // notes omitted → preserve existing
    });
    expect(preserved.notes).toBe('original');

    const cleared = await session.updateEntry(created.id, {
      name: 'A',
      value: 'v',
      notes: null,
    });
    expect(cleared.notes).toBeUndefined();
  });

  it('clears expiresAt when input.expiresAt is null', async () => {
    const created = await session.addEntry({
      name: 'A',
      value: 'v',
      expiresAt: '2027-01-01',
    });
    const cleared = await session.updateEntry(created.id, {
      name: 'A',
      value: 'v',
      expiresAt: null,
    });
    expect(cleared.expiresAt).toBeUndefined();
  });

  it('replaces tags when provided, preserves when undefined', async () => {
    const created = await session.addEntry({
      name: 'A',
      value: 'v',
      tags: ['work', 'urgent'],
    });
    const replaced = await session.updateEntry(created.id, {
      name: 'A',
      value: 'v',
      tags: ['Personal', 'PERSONAL'],
    });
    expect(replaced.tags).toEqual(['personal']);

    const preserved = await session.updateEntry(created.id, {
      name: 'A',
      value: 'v',
    });
    expect(preserved.tags).toEqual(['personal']);
  });
});

describe('updateEntry — failure modes', () => {
  it('throws notFound for an unknown id', async () => {
    const session = await unlocked();
    await expect(
      session.updateEntry('nope', { name: 'A', value: 'v' }),
    ).rejects.toMatchObject({ code: 'notFound' });
  });

  it('throws duplicateName when renaming to collide with another entry', async () => {
    const session = await unlocked();
    await session.addEntry({ name: 'GitHub', value: 'v1' });
    const b = await session.addEntry({ name: 'GitLab', value: 'v2' });
    await expect(
      session.updateEntry(b.id, { name: 'github', value: 'v2' }),
    ).rejects.toMatchObject({ code: 'duplicateName' });
  });

  it('allows keeping the same name (no false collision with itself)', async () => {
    const session = await unlocked();
    const a = await session.addEntry({ name: 'GitHub', value: 'v1' });
    const updated = await session.updateEntry(a.id, {
      name: 'GitHub',
      value: 'v2',
    });
    expect(updated.name).toBe('GitHub');
  });

  it('rejects updateEntry when locked', async () => {
    const session = await unlocked();
    const a = await session.addEntry({ name: 'A', value: 'v' });
    session.lock();
    await expect(
      session.updateEntry(a.id, { name: 'A', value: 'v2' }),
    ).rejects.toMatchObject({ code: 'locked' });
  });
});
