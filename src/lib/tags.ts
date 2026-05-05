/**
 * Tag normalization. SPEC §5.2: "0–10 tags, each 1–24 chars, lowercase
 * normalized."
 *
 * Both the popup and the SW call into here. The form normalizes on commit
 * (so the chip shows "github" when the user typed "GitHub"); the SW
 * re-normalizes on save as defense in depth. Idempotent — running twice
 * yields the same result.
 */

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 24;

/**
 * Normalize a single tag: trim whitespace, lowercase, collapse internal
 * whitespace runs to a single dash. Returns the empty string if the input
 * is all-whitespace or longer than {@link MAX_TAG_LENGTH} after trimming.
 */
export function normalizeTag(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, '-');
  if (trimmed.length === 0 || trimmed.length > MAX_TAG_LENGTH) return '';
  return trimmed;
}

/**
 * Normalize an entire tag list: per-item normalize, drop empties, dedupe
 * (case-insensitive — but post-normalization that's just string equality),
 * cap at {@link MAX_TAGS}. Order is preserved by first occurrence.
 */
export function normalizeTags(input: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const tag = normalizeTag(raw);
    if (tag === '' || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}
