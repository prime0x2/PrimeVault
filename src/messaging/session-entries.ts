/**
 * CRUD methods for the session: get / add / update / delete / markUsed.
 * Pure with respect to the closure state — every method takes the
 * SessionCore and never reaches outside it.
 */

import { normalizeTags } from '../lib/tags';
import { ulid } from '../lib/ulid';
import type { Entry, VaultPlaintext } from '../storage/schema';
import { type EntryInput, MessagingError } from './protocol';
import type { SessionCore } from './session-core';

export interface EntryMethods {
  getEntries(): Promise<Entry[]>;
  addEntry(input: EntryInput): Promise<Entry>;
  updateEntry(id: string, input: EntryInput): Promise<Entry>;
  deleteEntry(id: string): Promise<{ deleted: boolean }>;
  markUsed(id: string): Promise<Entry>;
}

export function createEntryMethods(core: SessionCore): EntryMethods {
  async function getEntries(): Promise<Entry[]> {
    const { plaintext } = await core.readPlaintext();
    core.bumpActivity();
    return plaintext.entries;
  }

  async function addEntry(input: EntryInput): Promise<Entry> {
    const { envelope, plaintext } = await core.readPlaintext();

    const conflict = plaintext.entries.find(
      (e) => e.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (conflict !== undefined) {
      throw new MessagingError(
        'duplicateName',
        `An entry named "${conflict.name}" already exists`,
      );
    }

    const ts = core.nowIso();
    const entry: Entry = {
      id: ulid(core.now),
      name: input.name,
      value: input.value,
      ...(input.notes && input.notes.length > 0 ? { notes: input.notes } : {}),
      tags: normalizeTags(input.tags ?? []),
      // 'secret' is the neutral catchall; user can refine via the kind picker.
      kind: input.kind ?? 'secret',
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      createdAt: ts,
      updatedAt: ts,
      copyCount: 0,
    };
    const next: VaultPlaintext = {
      ...plaintext,
      entries: [...plaintext.entries, entry],
    };
    await core.writePlaintext(envelope, next);
    core.bumpActivity();
    return entry;
  }

  async function updateEntry(id: string, input: EntryInput): Promise<Entry> {
    const { envelope, plaintext } = await core.readPlaintext();
    const idx = plaintext.entries.findIndex((e) => e.id === id);
    const existing = idx === -1 ? undefined : plaintext.entries[idx];
    if (existing === undefined) {
      throw new MessagingError('notFound', `Entry ${id} not found`);
    }

    // Reject a rename that collides with another entry's name.
    const conflict = plaintext.entries.find(
      (e) => e.id !== id && e.name.toLowerCase() === input.name.toLowerCase(),
    );
    if (conflict !== undefined) {
      throw new MessagingError(
        'duplicateName',
        `An entry named "${conflict.name}" already exists`,
      );
    }

    const ts = core.nowIso();
    // Build the updated entry. Optional fields use the input value; null
    // means "clear it"; undefined means "preserve existing".
    const updated: Entry = {
      ...existing,
      name: input.name,
      value: input.value,
      tags:
        input.tags !== undefined ? normalizeTags(input.tags) : existing.tags,
      kind: input.kind ?? existing.kind,
      updatedAt: ts,
    };
    if (input.notes === null) {
      delete (updated as { notes?: string }).notes;
    } else if (typeof input.notes === 'string' && input.notes.length > 0) {
      updated.notes = input.notes;
    } else if (input.notes === undefined) {
      // preserve existing
    } else {
      // empty string → treat as clear
      delete (updated as { notes?: string }).notes;
    }
    if (input.expiresAt === null) {
      delete (updated as { expiresAt?: string }).expiresAt;
    } else if (typeof input.expiresAt === 'string') {
      updated.expiresAt = input.expiresAt;
    }
    if (input.scope === null) {
      delete (updated as { scope?: Entry['scope'] }).scope;
    } else if (input.scope !== undefined) {
      updated.scope = input.scope;
    }

    const entries = plaintext.entries.slice();
    entries[idx] = updated;
    await core.writePlaintext(envelope, { ...plaintext, entries });
    core.bumpActivity();
    return updated;
  }

  async function deleteEntry(id: string): Promise<{ deleted: boolean }> {
    const { envelope, plaintext } = await core.readPlaintext();
    const filtered = plaintext.entries.filter((e) => e.id !== id);
    if (filtered.length === plaintext.entries.length) {
      core.bumpActivity();
      return { deleted: false };
    }
    await core.writePlaintext(envelope, { ...plaintext, entries: filtered });
    core.bumpActivity();
    return { deleted: true };
  }

  async function markUsed(id: string): Promise<Entry> {
    const { envelope, plaintext } = await core.readPlaintext();
    const idx = plaintext.entries.findIndex((e) => e.id === id);
    const target = idx === -1 ? undefined : plaintext.entries[idx];
    if (target === undefined) {
      throw new MessagingError('notFound', `Entry ${id} not found`);
    }
    const ts = core.nowIso();
    const updated: Entry = {
      ...target,
      lastUsedAt: ts,
      copyCount: target.copyCount + 1,
      updatedAt: ts,
    };
    const entries = plaintext.entries.slice();
    entries[idx] = updated;
    await core.writePlaintext(envelope, { ...plaintext, entries });
    core.bumpActivity();
    return updated;
  }

  return { getEntries, addEntry, updateEntry, deleteEntry, markUsed };
}
