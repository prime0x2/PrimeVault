/**
 * Offscreen document used to overwrite the clipboard from the SW. SPEC §10.4.
 *
 * Service workers can't access `navigator.clipboard.writeText` (no DOM,
 * no user-gesture context). The MV3 idiom is to spin up an offscreen
 * document with `reasons: ['CLIPBOARD']`, send it a message asking it to
 * do the clipboard write, and close the document immediately after.
 *
 * The document only stays alive for one round trip — the SW closes it as
 * soon as the response comes back. Anything that lives longer than that
 * belongs in the SW itself.
 */

import { browser } from 'wxt/browser';

interface ClearMessage {
  target: 'offscreen';
  kind: 'clearClipboard';
}

function isClearMessage(value: unknown): value is ClearMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { target?: unknown }).target === 'offscreen' &&
    (value as { kind?: unknown }).kind === 'clearClipboard'
  );
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isClearMessage(message)) return false;
  // Unconditional clear (SPEC §10.4 — we don't read the clipboard to
  // verify our own write is still there; the user opted in to auto-clear).
  navigator.clipboard
    .writeText('')
    .then(() => sendResponse({ ok: true }))
    .catch((err: unknown) => {
      sendResponse({
        ok: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    });
  return true;
});
