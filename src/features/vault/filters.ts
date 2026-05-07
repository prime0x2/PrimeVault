/**
 * Pure helpers for the vault filter chip row. Extracted so the count
 * derivation, sort, and pinning logic stay unit-testable independent of
 * React render state.
 *
 * The chip row models two filter dimensions:
 *  - `kindFilter`  : EntryKind | null
 *  - `expiryFilter`: 'expired' | 'soon' | null
 *
 * Both are independent — either, both, or neither may be active.
 */

import { ENTRY_KINDS, type Entry, type EntryKind } from '../../storage/schema';
import { type ExpiryUrgency, expiryUrgency } from './expiry';

/** Pair an entry with its computed urgency once so downstream filters
 *  don't re-parse `expiresAt` for every chip count and filter pass. */
export interface EntryWithUrgency {
  entry: Entry;
  urgency: ExpiryUrgency | null;
}

export function withUrgency(entries: readonly Entry[]): EntryWithUrgency[] {
  return entries.map((e) => ({
    entry: e,
    urgency: expiryUrgency(e.expiresAt),
  }));
}

/** Per-kind count map. Skipped kinds get no key (callers default to 0). */
export function buildKindCounts(
  entries: readonly EntryWithUrgency[],
): Partial<Record<EntryKind, number>> {
  const counts: Partial<Record<EntryKind, number>> = {};
  for (const { entry } of entries)
    counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
  return counts;
}

export interface ExpiryCounts {
  expired: number;
  soon: number;
}

export function buildExpiryCounts(
  entries: readonly EntryWithUrgency[],
): ExpiryCounts {
  let expired = 0;
  let soon = 0;
  for (const { urgency } of entries) {
    if (urgency === 'expired') expired++;
    else if (urgency === 'soon') soon++;
  }
  return { expired, soon };
}

/**
 * Decide which kind chips to render and in what order:
 *  - Include only kinds with at least one entry, OR the currently-active
 *    kind filter (so a count-0 active filter chip stays clearable).
 *  - Sort by descending count, with ENTRY_KINDS canonical order as the
 *    tie-break so the row stays stable across re-renders.
 */
export function sortVisibleKinds(
  counts: Partial<Record<EntryKind, number>>,
  active: EntryKind | null,
): EntryKind[] {
  return ENTRY_KINDS.filter((k) => (counts[k] ?? 0) > 0 || k === active).sort(
    (a, b) => {
      const diff = (counts[b] ?? 0) - (counts[a] ?? 0);
      if (diff !== 0) return diff;
      return ENTRY_KINDS.indexOf(a) - ENTRY_KINDS.indexOf(b);
    },
  );
}

/**
 * Pick which kind chips render inline when the row is collapsed. Pins
 * the active filter into the visible slice if it falls past the cap
 * — the user must always see (and be able to clear) their active filter.
 *
 * @param visible    Sorted list (output of {@link sortVisibleKinds}).
 * @param active     Currently-selected kind, or null.
 * @param cap        Max number of inline kind chips (excluding 'all').
 */
export function pickInlineKinds(
  visible: readonly EntryKind[],
  active: EntryKind | null,
  cap: number,
): EntryKind[] {
  const head = visible.slice(0, cap);
  if (active && !head.includes(active)) {
    return [...head.slice(0, Math.max(0, cap - 1)), active];
  }
  return head;
}
