/**
 * Wire protocol between the popup and the service worker. SPEC §6.3, §7.
 *
 * The popup never holds the derived key; it asks the service worker (which
 * does) to perform unlock/setup/lock/CRUD and to inspect status.
 *
 * Adding a new message kind requires three changes:
 *   1. add a member to {@link messageSchema},
 *   2. add a branch to {@link ResponseFor},
 *   3. add the handler in `session.ts` / wire in `background.ts`.
 *
 * Both sides validate with Zod even though the popup is "our own code": the
 * SW listens to anything in the extension origin, and Zod catches
 * version-skew between popup and SW after extension auto-updates.
 */

import { z } from 'zod';
import { type Envelope, envelopeSchema } from '../crypto/envelope';
import { ENTRY_KINDS, type Entry } from '../storage/schema';

export const vaultStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('uninitialized') }),
  z.object({ state: z.literal('locked') }),
  z.object({
    state: z.literal('unlocked'),
    /**
     * Epoch ms when auto-lock will fire, or `null` when auto-lock is
     * disabled (`autoLockMinutes: 0`). The popup uses this to schedule a
     * refetch when the timer elapses; `null` skips that.
     */
    expiresAt: z.union([z.number().int().nonnegative(), z.null()]),
  }),
]);

export type VaultStatus = z.infer<typeof vaultStatusSchema>;

/**
 * Full input shape for both addEntry and updateEntry. Length caps mirror
 * the entry schema (storage/schema.ts). Optional fields (notes, tags, kind,
 * expiresAt) absent in `addEntry` get sensible defaults applied by the
 * session; absent in `updateEntry` means "preserve existing value" — the
 * session merges onto the existing entry rather than replacing.
 *
 * Notes on field semantics:
 *  - `tags` come over the wire pre-normalized (lowercase, deduped) by the
 *    UI; the session re-normalizes as defense in depth.
 *  - `expiresAt` is YYYY-MM-DD (date-only), matching the storage schema.
 *  - Pass `expiresAt: null` to clear an existing expiry; omit to leave it.
 *  - Same for `notes`.
 */
export const entryInputSchema = z.object({
  name: z.string().min(1).max(80),
  value: z.string().min(1).max(8192),
  notes: z.union([z.string().max(2000), z.null()]).optional(),
  tags: z.array(z.string().min(1).max(24)).max(10).optional(),
  kind: z.enum(ENTRY_KINDS).optional(),
  expiresAt: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()])
    .optional(),
});

export type EntryInput = z.infer<typeof entryInputSchema>;

export const messageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('getStatus') }),
  z.object({ kind: z.literal('setupVault'), password: z.string().min(1) }),
  z.object({ kind: z.literal('unlock'), password: z.string().min(1) }),
  z.object({ kind: z.literal('lock') }),
  z.object({ kind: z.literal('getEntries') }),
  z.object({ kind: z.literal('addEntry'), input: entryInputSchema }),
  z.object({
    kind: z.literal('updateEntry'),
    id: z.string().min(1),
    input: entryInputSchema,
  }),
  z.object({ kind: z.literal('deleteEntry'), id: z.string().min(1) }),
  z.object({ kind: z.literal('markUsed'), id: z.string().min(1) }),
  /**
   * Change master password. Re-verifies `currentPassword` against the
   * on-disk envelope (even if the session is unlocked) before re-encrypting
   * with `newPassword`. SPEC §4.5.
   */
  z.object({
    kind: z.literal('changePassword'),
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
  }),
  /**
   * Wipe the encrypted vault. Preserves prefs and meta. Returns
   * `{ state: 'uninitialized' }` so the popup can re-route to onboarding.
   * SPEC §4.6.
   */
  z.object({ kind: z.literal('resetVault') }),
  /**
   * Re-verify `password` against the on-disk envelope, then return the
   * envelope unchanged so the popup can serialize it to a backup file.
   * SPEC §4.4: encrypted-backup export requires a password re-prompt.
   * The exported file contains the envelope as-is (already encrypted).
   */
  z.object({
    kind: z.literal('exportEncrypted'),
    password: z.string().min(1),
  }),
  /**
   * Replace the on-disk envelope with the supplied one (from a backup
   * file), after verifying that `password` decrypts it. Atomic swap.
   * Leaves the session unlocked under the imported envelope.
   */
  z.object({
    kind: z.literal('importEncrypted'),
    envelope: envelopeSchema,
    password: z.string().min(1),
  }),
  /**
   * Re-verify `password` and return the decrypted entries. The popup is
   * responsible for prompting confirmation, formatting the file, and
   * triggering the download. SPEC §4.4: plaintext export is heavily gated.
   */
  z.object({
    kind: z.literal('exportPlaintext'),
    password: z.string().min(1),
  }),
  /**
   * Schedule (or cancel) the clipboard auto-clear. SPEC §10.4. The popup
   * sends this after `navigator.clipboard.writeText(value)` succeeds; the
   * SW arms a chrome.alarms alarm and then proxies the actual clear
   * through an offscreen document when it fires. `delayMs <= 0` cancels.
   */
  z.object({
    kind: z.literal('scheduleClipboardClear'),
    delayMs: z.number().int().nonnegative(),
  }),
]);

export type Message = z.infer<typeof messageSchema>;
export type MessageKind = Message['kind'];

/**
 * Per-kind response type. The wire schema's `data` is just `unknown` —
 * runtime validation lives in the session and (where needed) the messaging
 * client; this type is the static contract.
 */
export type ResponseFor<K extends MessageKind> = K extends
  | 'getStatus'
  | 'setupVault'
  | 'unlock'
  | 'lock'
  | 'changePassword'
  | 'resetVault'
  | 'importEncrypted'
  ? VaultStatus
  : K extends 'getEntries' | 'exportPlaintext'
    ? Entry[]
    : K extends 'addEntry' | 'updateEntry' | 'markUsed'
      ? Entry
      : K extends 'deleteEntry'
        ? { deleted: boolean }
        : K extends 'exportEncrypted'
          ? Envelope
          : K extends 'scheduleClipboardClear'
            ? { scheduled: boolean }
            : never;

export const ERROR_CODES = [
  'invalidRequest',
  'alreadyInitialized',
  'notInitialized',
  'wrongPassword',
  'corruptVault',
  'locked',
  'notFound',
  'duplicateName',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * What goes over the wire. The dispatcher serializes both success and
 * failure into this shape so neither side has to deal with thrown errors
 * crossing the message boundary.
 *
 * `data` is typed `unknown` because each message kind returns a different
 * shape; static narrowing happens via {@link ResponseFor} at the call site.
 */
export const wireResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  z.object({
    ok: z.literal(false),
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
]);

export type WireResponse = z.infer<typeof wireResponseSchema>;

/**
 * Thrown by the messaging client (and from session handlers) when an op
 * cannot complete. The client maps `ok: false` wire responses to instances
 * of this class so callers can `instanceof` and inspect `.code`.
 */
export class MessagingError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MessagingError';
  }
}
