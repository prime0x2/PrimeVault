/**
 * Playwright fixtures that load the built PrimeVault extension into a
 * persistent Chromium context. Each `test(...)` gets:
 *
 *   `context`      — the persistent BrowserContext, with the extension loaded.
 *   `extensionId`  — the runtime-assigned chrome-extension://<id>/ value.
 *   `popup`        — a freshly opened page at chrome-extension://<id>/popup.html.
 *   `optionsPage`  — same, but options.html.
 *
 * Why a persistent context? Chrome extensions don't load in standard
 * `chromium.launch()` headless mode. They require `launchPersistentContext`
 * with `--load-extension=<dir>` and a real on-disk profile. We give each
 * test a fresh tmpdir so the extension's `chrome.storage.local` starts empty.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type BrowserContext, test as base, chromium } from '@playwright/test';

// ESM doesn't expose __dirname; derive it from import.meta.url.
const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSION_DIR = resolve(__dirname, '../.output/chrome-mv3');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  popup: import('@playwright/test').Page;
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires this destructure shape (no fixture deps for `context`).
  context: async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'pv-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      // Extensions only run in the headed Chrome binary, not the headless
      // shell. The `--headless=new` flag gets close, but service-worker
      // spinup is reliable only in fully-headed mode for MV3.
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    await use(context);
    await context.close();
    await rm(profile, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    // The service worker registers under a runtime-assigned chrome-extension://
    // origin. Wait for it (it should boot within ~1s of context launch).
    let [worker] = context.serviceWorkers();
    if (!worker) {
      worker = await context.waitForEvent('serviceworker');
    }
    const url = worker.url();
    const match = /^chrome-extension:\/\/([a-z]+)\//.exec(url);
    if (!match) throw new Error(`Could not parse extension ID from ${url}`);
    await use(match[1]!);
  },

  popup: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    await use(page);
  },
});

export { expect } from '@playwright/test';
