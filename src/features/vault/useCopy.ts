/**
 * Copy-to-clipboard hook for an entry value, with the post-copy "clears in
 * Xs" banner and a brief in-button check-mark flash. Owns:
 *   • The actual `navigator.clipboard.writeText` call (popup runs in a
 *     user-gesture context so this works without the offscreen doc).
 *   • A schedule message to the SW so the auto-clear survives popup close.
 *   • A `markUsed` ping to update lastUsedAt / copyCount on the entry.
 *   • The transient `copyFlash` icon swap (1s) and `copyBanner` text (capped
 *     at the smaller of the configured clear delay or {@link COPY_BANNER_MAX_MS}).
 *   • Honest display seconds — Chrome alarms floor anything below 30s, so
 *     the banner reflects what the user will actually experience.
 *
 * Errors from the SW round-trip are intentionally non-fatal. The clipboard
 * write itself already succeeded by the time we get there; if scheduling
 * the clear or marking the entry fails, the user has no useful action and
 * we don't want to block the UI on it.
 */

import { useEffect, useState } from 'react';
import { popupClient } from '../../messaging/popup-client';
import {
  type ClipboardClearSeconds,
  effectiveClipboardClearSeconds,
} from '../../storage/prefs';

const COPY_FLASH_MS = 1_000;
const COPY_BANNER_MAX_MS = 8_000;

interface UseCopyArgs {
  entryId: string;
  entryValue: string;
  clipboardClearSeconds: ClipboardClearSeconds;
  onCopied: () => void;
}

export interface UseCopyResult {
  copy: () => Promise<void>;
  busy: boolean;
  copyFlash: boolean;
  copyBanner: boolean;
  /** The clear delay actually visible to the user, after Chrome's floor. */
  displaySeconds: number;
}

export function useCopy({
  entryId,
  entryValue,
  clipboardClearSeconds,
  onCopied,
}: UseCopyArgs): UseCopyResult {
  const [copyFlash, setCopyFlash] = useState(false);
  const [copyBanner, setCopyBanner] = useState(false);
  const [busy, setBusy] = useState(false);

  const displaySeconds = effectiveClipboardClearSeconds(clipboardClearSeconds);

  useEffect(() => {
    if (!copyFlash) return;
    const handle = window.setTimeout(() => setCopyFlash(false), COPY_FLASH_MS);
    return () => window.clearTimeout(handle);
  }, [copyFlash]);

  useEffect(() => {
    if (!copyBanner) return;
    const ms = Math.min(
      displaySeconds > 0 ? displaySeconds * 1000 : COPY_BANNER_MAX_MS,
      COPY_BANNER_MAX_MS,
    );
    const handle = window.setTimeout(() => setCopyBanner(false), ms);
    return () => window.clearTimeout(handle);
  }, [copyBanner, displaySeconds]);

  async function copy(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.writeText(entryValue);
      setCopyFlash(true);
      setCopyBanner(true);

      const delayMs = clipboardClearSeconds * 1000;
      popupClient
        .send({ kind: 'scheduleClipboardClear', delayMs })
        .catch(() => undefined);

      popupClient
        .send({ kind: 'markUsed', id: entryId })
        .then(() => onCopied())
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return { copy, busy, copyFlash, copyBanner, displaySeconds };
}
