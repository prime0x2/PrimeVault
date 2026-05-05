import { browser } from 'wxt/browser';
import {
  type AlarmsApi,
  createClipboardClearer,
  type OffscreenApi,
  type RuntimeMessenger,
} from '../messaging/clipboard';
import { type Handlers, handleMessage } from '../messaging/server';
import { createSession } from '../messaging/session';
import { createBrowserBackend, STORAGE_KEYS } from '../storage/client';
import {
  autoLockMinutesToMs,
  DEFAULT_PREFS,
  mergeDefaults,
} from '../storage/prefs';

export default defineBackground(() => {
  const backend = createBrowserBackend(browser.storage.local);

  // Cache the auto-lock setting so the session can read it synchronously on
  // every activity bump. Initialized to the default and refreshed from
  // storage on boot + on every change to pv:prefs. The session calls
  // `() => currentAutoLockMs` so a prefs change takes effect from the next
  // message onward without recreating the session (which would lose the
  // in-memory key).
  let currentAutoLockMs = autoLockMinutesToMs(DEFAULT_PREFS.autoLockMinutes);

  void (async () => {
    const raw = await backend.get(STORAGE_KEYS.prefs);
    currentAutoLockMs = autoLockMinutesToMs(mergeDefaults(raw).autoLockMinutes);
  })();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const change = changes[STORAGE_KEYS.prefs];
    if (change === undefined) return;
    currentAutoLockMs = autoLockMinutesToMs(
      mergeDefaults(change.newValue).autoLockMinutes,
    );
  });

  const session = createSession({
    backend,
    autoLockMs: () => currentAutoLockMs,
  });

  // Clipboard auto-clear lives outside the session because it doesn't
  // touch crypto state — the SW only schedules an alarm and proxies the
  // actual clear through an offscreen document when the alarm fires.
  // Casting through the structural interfaces lets the implementation
  // module stay free of `wxt/browser` types.
  const clipboard = createClipboardClearer({
    alarms: browser.alarms as unknown as AlarmsApi,
    offscreen: (browser as unknown as { offscreen: OffscreenApi }).offscreen,
    runtime: browser.runtime as unknown as RuntimeMessenger,
    // WXT emits the offscreen entrypoint at the manifest root.
    offscreenUrl: browser.runtime.getURL('/offscreen.html'),
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (!clipboard.isClearAlarm(alarm.name)) return;
    void clipboard.fire();
  });

  const handlers: Handlers = {
    getStatus: () => session.status(),
    setupVault: ({ password }) => session.setupVault(password),
    unlock: ({ password }) => session.unlock(password),
    lock: () => session.lock(),
    getEntries: () => session.getEntries(),
    addEntry: ({ input }) => session.addEntry(input),
    updateEntry: ({ id, input }) => session.updateEntry(id, input),
    deleteEntry: ({ id }) => session.deleteEntry(id),
    markUsed: ({ id }) => session.markUsed(id),
    changePassword: ({ currentPassword, newPassword }) =>
      session.changePassword(currentPassword, newPassword),
    resetVault: () => session.resetVault(),
    exportEncrypted: ({ password }) => session.exportEncrypted(password),
    importEncrypted: ({ envelope, password }) =>
      session.importEncrypted(envelope, password),
    exportPlaintext: ({ password }) => session.exportPlaintext(password),
    scheduleClipboardClear: async ({ delayMs }) => {
      await clipboard.schedule(delayMs);
      return { scheduled: delayMs > 0 };
    },
  };

  // Use the explicit `return true` + sendResponse pattern. Chrome MV3 also
  // accepts Promise-returning listeners in newer versions, but in practice
  // the response can arrive as `undefined` at the sender. The classic
  // callback pattern is the most reliable.
  //
  // The listener also has to ignore messages targeted at the offscreen
  // document — those are sent by the SW to its own offscreen child, but
  // chrome.runtime.sendMessage broadcasts to every extension context
  // (including this one). Returning `false` (no return-true) makes Chrome
  // skip this listener and route the message to the offscreen doc.
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as { target?: unknown }).target === 'offscreen'
    ) {
      return false;
    }
    handleMessage(message, handlers).then(sendResponse, (err: unknown) => {
      sendResponse({
        ok: false,
        code: 'internal',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    });
    return true;
  });
});
