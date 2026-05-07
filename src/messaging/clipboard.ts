/**
 * Clipboard auto-clear scheduling. SPEC §10.4.
 *
 * Lifecycle:
 *  1. Popup writes the entry value to the clipboard (in its own
 *     user-gesture context — that's the only place it works).
 *  2. Popup messages the SW with `scheduleClipboardClear({ delayMs })`.
 *  3. SW (this module) creates a chrome.alarms alarm at `now + delayMs`.
 *     Earlier alarm of the same name is cleared first so a fresh copy
 *     resets the timer.
 *  4. When the alarm fires, SW spawns an offscreen document, asks it to
 *     overwrite the clipboard with empty string, then closes the doc.
 *
 * We never read the clipboard to check whether our own write is still
 * there — privacy + no observable difference, since the user opted in to
 * the auto-clear behavior. SPEC §10.4 calls this out explicitly.
 *
 * The whole module takes injected APIs (alarms / offscreen / runtime /
 * clock) so tests can drive it without touching real Chrome.
 *
 * Note on minimum delays: chrome.alarms in production clamps anything
 * below 30 seconds up to ~30 seconds. The user-facing options
 * (CLIPBOARD_CLEAR_OPTIONS in storage/prefs.ts) intentionally start at 30s
 * so the displayed delay matches what the user actually experiences.
 */

export interface AlarmsApi {
  clear(name: string): Promise<unknown>;
  create(
    name: string,
    info: { when?: number; delayInMinutes?: number },
  ): Promise<unknown>;
}

export interface OffscreenApi {
  hasDocument(): Promise<boolean>;
  createDocument(options: {
    url: string;
    reasons: string[];
    justification: string;
  }): Promise<unknown>;
  closeDocument(): Promise<unknown>;
}

export interface RuntimeMessenger {
  sendMessage(message: unknown): Promise<unknown>;
}

export interface ClipboardClearerDeps {
  alarms: AlarmsApi;
  offscreen: OffscreenApi;
  runtime: RuntimeMessenger;
  /** Resolved URL to load into the offscreen doc. */
  offscreenUrl: string;
  /** Defaults to `Date.now`. Tests inject. */
  now?: () => number;
}

export const CLIPBOARD_ALARM_NAME = 'pv:clearClipboard';

const OFFSCREEN_REASON = 'CLIPBOARD';
const OFFSCREEN_JUSTIFICATION =
  'Clear clipboard after the configured PrimeVault auto-clear timeout';

export interface ClipboardClearer {
  /**
   * Schedule (or reschedule) a clipboard clear after `delayMs`. Pass
   * `delayMs <= 0` to cancel any pending clear.
   */
  schedule(delayMs: number): Promise<void>;
  /**
   * Run the clear now: spawn an offscreen doc, ask it to wipe the
   * clipboard, close the doc. Idempotent if no offscreen doc is open.
   */
  fire(): Promise<void>;
  /** True when an alarm name should route to {@link fire}. */
  isClearAlarm(name: string): boolean;
}

export function createClipboardClearer(
  deps: ClipboardClearerDeps,
): ClipboardClearer {
  const now = deps.now ?? Date.now;

  async function schedule(delayMs: number): Promise<void> {
    await deps.alarms.clear(CLIPBOARD_ALARM_NAME);
    if (!Number.isFinite(delayMs) || delayMs <= 0) return;
    await deps.alarms.create(CLIPBOARD_ALARM_NAME, {
      when: now() + delayMs,
    });
  }

  async function fire(): Promise<void> {
    const hasDoc = await deps.offscreen.hasDocument();
    if (!hasDoc) {
      await deps.offscreen.createDocument({
        url: deps.offscreenUrl,
        reasons: [OFFSCREEN_REASON],
        justification: OFFSCREEN_JUSTIFICATION,
      });
    }
    try {
      await deps.runtime.sendMessage({
        target: 'offscreen',
        kind: 'clearClipboard',
      });
    } finally {
      try {
        await deps.offscreen.closeDocument();
      } catch {
        // Already closed, or closeDocument unsupported in some test envs.
      }
    }
  }

  return {
    schedule,
    fire,
    isClearAlarm: (name) => name === CLIPBOARD_ALARM_NAME,
  };
}
