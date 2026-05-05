/**
 * Pure search predicate for the vault list. SPEC §10.7.
 *
 * Match rules:
 *  - `name` matches as a case-insensitive substring.
 *  - `tags` match if any tag equals the query exactly (case-insensitive).
 *    Tags are stored already-normalized (lowercase, dash-joined), but we
 *    lowercase the query as defense in depth.
 *
 * v1 deliberately skips fuzzy matching — substring + exact tag covers the
 * "what was that token called again" case without surprising ranking.
 */

import type { Entry } from '../../storage/schema';

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase();
}

export function entryMatches(entry: Entry, query: string): boolean {
  if (query === '') return true;
  if (entry.name.toLowerCase().includes(query)) return true;
  return entry.tags.some((tag) => tag === query);
}

export function filterEntries(entries: Entry[], query: string): Entry[] {
  const q = normalizeQuery(query);
  if (q === '') return entries;
  return entries.filter((e) => entryMatches(e, q));
}
