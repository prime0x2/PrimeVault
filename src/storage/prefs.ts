/**
 * Unencrypted user preferences. SPEC §5.3.
 *
 * Prefs are NOT secret and NOT encrypted: the popup reads them before unlock
 * to render its first frame (theme, layout) without an SW round-trip, and
 * `chrome.runtime.openOptionsPage` works regardless of vault state.
 *
 * Stored under {@link STORAGE_KEYS.prefs}. Schema is versioned so we can
 * grow new fields without breaking older installs — `mergeDefaults` fills
 * any missing field with the default, so partial/older payloads upgrade in
 * place on first read.
 */

import { z } from 'zod';
import { STORAGE_KEYS, type StorageBackend } from './client';
import { ENTRY_KINDS, type EntryKind } from './schema';

export const PREFS_VERSION = 1 as const;

export const AUTO_LOCK_MINUTE_OPTIONS = [0, 1, 2, 5, 15, 60] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_MINUTE_OPTIONS)[number];

export const CLIPBOARD_CLEAR_OPTIONS = [0, 15, 30, 60] as const;
export type ClipboardClearSeconds = (typeof CLIPBOARD_CLEAR_OPTIONS)[number];

export const THEME_OPTIONS = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEME_OPTIONS)[number];

export const ACCENT_OPTIONS = ['slate', 'violet', 'green'] as const;
export type Accent = (typeof ACCENT_OPTIONS)[number];

export const prefsSchema = z.object({
  prefsVersion: z.literal(PREFS_VERSION),
  theme: z.enum(THEME_OPTIONS),
  accent: z.enum(ACCENT_OPTIONS),
  autoLockMinutes: z.union(
    AUTO_LOCK_MINUTE_OPTIONS.map((n) => z.literal(n)) as [
      z.ZodLiteral<0>,
      z.ZodLiteral<1>,
      z.ZodLiteral<2>,
      z.ZodLiteral<5>,
      z.ZodLiteral<15>,
      z.ZodLiteral<60>,
    ],
  ),
  clipboardClearSeconds: z.union(
    CLIPBOARD_CLEAR_OPTIONS.map((n) => z.literal(n)) as [
      z.ZodLiteral<0>,
      z.ZodLiteral<15>,
      z.ZodLiteral<30>,
      z.ZodLiteral<60>,
    ],
  ),
  defaultEntryKind: z.enum(ENTRY_KINDS),
  shortcutHint: z.boolean(),
});

export type Prefs = z.infer<typeof prefsSchema>;

export const DEFAULT_PREFS: Prefs = {
  prefsVersion: PREFS_VERSION,
  theme: 'system',
  accent: 'slate',
  autoLockMinutes: 2,
  clipboardClearSeconds: 30,
  defaultEntryKind: 'secret' satisfies EntryKind,
  shortcutHint: true,
};

/**
 * Merge an arbitrary stored value with {@link DEFAULT_PREFS}. Any field that
 * fails parsing falls back to its default — survives partial reads, schema
 * upgrades, and corrupted state without throwing. New fields added to
 * {@link Prefs} need a default in {@link DEFAULT_PREFS}; older clients then
 * pick up the default automatically on next read.
 */
export function mergeDefaults(value: unknown): Prefs {
  if (value === undefined || value === null || typeof value !== 'object') {
    return DEFAULT_PREFS;
  }
  const partial = value as Record<string, unknown>;
  const candidate = {
    ...DEFAULT_PREFS,
    ...partial,
    prefsVersion: PREFS_VERSION,
  };
  const parsed = prefsSchema.safeParse(candidate);
  if (!parsed.success) {
    // One field corrupt? Build the merged object field-by-field, falling
    // back to defaults for anything that doesn't validate. This keeps a
    // single bad value from wiping the user's other preferences.
    return rebuildField(partial);
  }
  return parsed.data;
}

function rebuildField(partial: Record<string, unknown>): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS };
  // For each field, try a single-key parse; fall back to default on failure.
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    if (!(key in partial)) continue;
    const candidate = { ...out, [key]: partial[key] };
    const result = prefsSchema.safeParse(candidate);
    if (result.success) {
      out[key] = result.data[key] as never;
    }
  }
  return out;
}

export async function readPrefs(backend: StorageBackend): Promise<Prefs> {
  const raw = await backend.get(STORAGE_KEYS.prefs);
  return mergeDefaults(raw);
}

export async function writePrefs(
  backend: StorageBackend,
  prefs: Prefs,
): Promise<void> {
  await backend.set(STORAGE_KEYS.prefs, prefs);
}

/**
 * Convert an `autoLockMinutes` setting to the millisecond value the session
 * scheduler expects. `0` ("Never") returns 0, which the session treats as
 * "do not schedule a timer" — see {@link createSession}.
 */
export function autoLockMinutesToMs(minutes: AutoLockMinutes): number {
  return minutes * 60 * 1000;
}

/**
 * Chrome's `chrome.alarms` API floors any non-dev alarm to ~30 seconds.
 * Anything we schedule below this fires at 30s anyway.
 */
export const CHROME_ALARMS_MIN_SECONDS = 30;

/**
 * The clipboard-clear delay the user actually experiences, accounting for
 * Chrome's alarm-API floor. `0` (Never) is preserved; otherwise the value is
 * clamped up to {@link CHROME_ALARMS_MIN_SECONDS}. Used for honest UI copy
 * so the popup never promises a clear faster than Chrome will deliver it.
 */
export function effectiveClipboardClearSeconds(
  seconds: ClipboardClearSeconds,
): number {
  if (seconds === 0) return 0;
  return Math.max(seconds, CHROME_ALARMS_MIN_SECONDS);
}
