/**
 * Capture native-size popup screenshots for the Chrome Web Store listing.
 *
 * Uses the same `launchPersistentContext` + `--load-extension` harness as
 * `e2e/fixtures.ts` — the only way Chromium will actually run an MV3 extension.
 * Each scene gets a fresh on-disk profile so chrome.storage.local starts empty.
 *
 * Outputs: docs/screenshots/raw/{NN-name}.png
 *   - 01-onboarding.png   380×560
 *   - 02-vault-list.png   380×560
 *   - 03-add-entry.png    380×560
 *   - 04-unlock.png       380×560
 *   - 05-options.png      1024×720 (options is a full-page tab, not popup)
 *
 * Usage: `pnpm build && node scripts/screenshots/capture.mjs`
 *
 * The popup is 380×560 in src/entrypoints/popup/style.css. We drive Chromium
 * with that viewport so the screenshot is exactly the visible popup.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const EXTENSION_DIR = resolve(ROOT, '.output/chrome-mv3');
const OUT_DIR = resolve(ROOT, 'docs/screenshots/raw');

const POPUP = { width: 380, height: 560 };
// Options layout uses `max-w-2xl` (672px) + px-6 padding ≈ 720px natural
// width. Capturing at that width fills the frame; height extended so the
// Security + Appearance sections both land without cutoff.
const OPTIONS = { width: 720, height: 900 };

const PASSWORD = 'correct-horse-battery-staple-9!';

// Realistic-looking sample entries. The values themselves are bogus but the
// shapes (sk_live_*, ghp_*, etc.) read as authentic in the screenshot.
//
// Insertion order is reverse-chronological in the UI (newest first), so the
// last item added shows up at the top of the list. We sequence so that the
// `expired` and `soon` badges land in the top two visible rows.
//
// Coverage: one of each of the 5 ENTRY_KINDS, mixed personal/work scopes,
// one expired entry, one expiring within EXPIRY_WARNING_DAYS (14d).
function daysFromNow(days) {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD for <input type="date">
}

const SAMPLE_ENTRIES = [
  {
    name: 'Recovery phrase',
    value: 'witch collapse practice feed shame open despair creek road again',
    kind: 'other',
    scope: 'personal',
    tags: ['wallet', 'backup'],
  },
  {
    name: 'WiFi password',
    value: 'helloPineapple#2024',
    kind: 'password',
    scope: 'personal',
    tags: ['home'],
  },
  {
    name: 'Stripe live key',
    value: 'sk_live_51HG8rLk2nDx9pQ3xMv7aB',
    kind: 'api_key',
    scope: 'work',
    tags: ['stripe', 'payments'],
  },
  {
    name: 'GitHub PAT',
    value: 'ghp_xb4kT9aLpQ3sV1nRmK7dF2cWzY8',
    kind: 'token',
    scope: 'work',
    expiresInDays: 7, // soon
    tags: ['github'],
  },
  {
    name: 'AWS root',
    value: 'AKIA9KT9ALPQ3SV1NRMK',
    kind: 'secret',
    scope: 'work',
    expiresInDays: -5, // expired
    tags: ['aws', 'prod'],
  },
];

async function newContext() {
  const profile = await mkdtemp(join(tmpdir(), 'pv-ss-'));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: POPUP,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });
  return { context, profile };
}

async function getExtensionId(context) {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const url = worker.url();
  const match = /^chrome-extension:\/\/([a-z]+)\//.exec(url);
  if (!match) throw new Error(`Could not parse extension ID from ${url}`);
  return match[1];
}

async function openPopup(context, extensionId, viewport = POPUP) {
  const page = await context.newPage();
  await page.setViewportSize(viewport);
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}

async function onboard(popup) {
  await popup.getByLabel(/master_password/i).fill(PASSWORD);
  await popup.getByLabel(/^confirm$/i).fill(PASSWORD);
  const createBtn = popup.getByRole('button', { name: /create vault/i });
  await createBtn.waitFor({ state: 'visible' });
  // Wait for zxcvbn lazy-load + debounce; same as e2e tests.
  await popup.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /create vault/i.test(b.textContent ?? ''),
      );
      return btn && !btn.disabled;
    },
    { timeout: 10_000 },
  );
  await createBtn.click();
  await popup.getByText(/vault is empty/i).waitFor({ timeout: 10_000 });
}

async function addEntry(popup, entry) {
  // Empty state shows a "+ new secret" button; subsequent adds use the
  // header "+ Add" — both have role=button with name matching /new|add/i.
  const adds = popup.getByRole('button', { name: /new secret|add/i });
  await adds.first().click();
  await popup.getByLabel(/^name$/i).fill(entry.name);
  await popup.getByLabel(/^value$/i).fill(entry.value);
  // Kind chip — buttons rendered with KIND_LABELS text.
  if (entry.kind && entry.kind !== 'secret') {
    // 'secret' is the default; other kinds need a click.
    await popup.getByRole('button', { name: new RegExp(`^${entry.kind}$`) }).click();
  }
  // Scope segmented control inside fieldset[aria-label="scope"].
  if (entry.scope) {
    await popup
      .locator('fieldset[aria-label="scope"]')
      .getByRole('button', { name: new RegExp(`^${entry.scope}$`) })
      .click();
  }
  // Expiry — date input takes YYYY-MM-DD. Always-visible (not behind expand).
  if (typeof entry.expiresInDays === 'number') {
    await popup.getByLabel(/^expires$/i).fill(daysFromNow(entry.expiresInDays));
  }
  if (entry.tags?.length) {
    // Tags + notes live behind "+ more options".
    await popup.getByRole('button', { name: /more options/i }).click();
    const tagInput = popup.getByLabel(/add tags?/i);
    for (const tag of entry.tags) {
      await tagInput.fill(tag);
      await tagInput.press('Enter');
    }
  }
  await popup.getByRole('button', { name: /^save$/i }).click();
  await popup.getByText(entry.name).waitFor({ timeout: 5_000 });
}

async function shoot(page, name, viewport = POPUP) {
  const out = join(OUT_DIR, `${name}.png`);
  await page.screenshot({
    path: out,
    clip: { x: 0, y: 0, ...viewport },
  });
  console.log(`  ✓ ${name.padEnd(20)} → docs/screenshots/raw/${name}.png`);
}

async function captureOnboarding() {
  const { context, profile } = await newContext();
  try {
    const id = await getExtensionId(context);
    const popup = await openPopup(context, id);
    // Just-typed password — show the strength meter mid-evaluation.
    await popup.getByLabel(/master_password/i).fill(PASSWORD);
    await popup.getByLabel(/^confirm$/i).fill(PASSWORD);
    // Let zxcvbn settle so the meter has a real score.
    await popup.waitForTimeout(800);
    await shoot(popup, '01-onboarding');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function captureVaultList() {
  const { context, profile } = await newContext();
  try {
    const id = await getExtensionId(context);
    const popup = await openPopup(context, id);
    await onboard(popup);
    for (const entry of SAMPLE_ENTRIES) await addEntry(popup, entry);
    // Make sure we're back on the list view.
    await popup.getByText(SAMPLE_ENTRIES[0].name).waitFor();
    await shoot(popup, '02-vault-list');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function captureAddEntry() {
  const { context, profile } = await newContext();
  try {
    const id = await getExtensionId(context);
    const popup = await openPopup(context, id);
    await onboard(popup);
    // A demo draft that exercises every field — kind, scope, expiry, tags,
    // notes — so the listing shot shows the form's full surface area.
    await popup
      .getByRole('button', { name: /new secret|add/i })
      .first()
      .click();
    await popup.getByLabel(/^name$/i).fill('GitHub PAT');
    await popup
      .getByLabel(/^value$/i)
      .fill('ghp_xb4kT9aLpQ3sV1nRmK7dF2cWzY8');
    await popup.getByRole('button', { name: /^token$/ }).click();
    await popup
      .locator('fieldset[aria-label="scope"]')
      .getByRole('button', { name: /^work$/ })
      .click();
    await popup.getByLabel(/^expires$/i).fill(daysFromNow(7));
    await popup.getByRole('button', { name: /more options/i }).click();
    const tagInput = popup.getByLabel(/add tags?/i);
    for (const tag of ['github', 'ci']) {
      await tagInput.fill(tag);
      await tagInput.press('Enter');
    }
    await popup
      .getByLabel(/^note$/i)
      .fill('rotated 2025-04 · CI uses ghp-secondary');
    // Settle.
    await popup.waitForTimeout(300);
    await shoot(popup, '03-add-entry');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function captureUnlock() {
  const { context, profile } = await newContext();
  try {
    const id = await getExtensionId(context);
    const popup = await openPopup(context, id);
    await onboard(popup);
    await popup.getByRole('button', { name: /lock vault/i }).click();
    await popup
      .getByRole('heading', { name: /welcome back/i })
      .waitFor({ timeout: 5_000 });
    // Type a password to make the field look "in use" without submitting.
    await popup.getByLabel(/master password/i).fill('•'.repeat(0));
    await popup.waitForTimeout(200);
    await shoot(popup, '04-unlock');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function captureOptions() {
  const { context, profile } = await newContext();
  try {
    const id = await getExtensionId(context);
    // Onboard first so options has a real vault to show settings against.
    const popup = await openPopup(context, id);
    await onboard(popup);
    await popup.close();
    // Options is a full-page tab; open at 1024×720.
    const opts = await context.newPage();
    await opts.setViewportSize(OPTIONS);
    await opts.goto(`chrome-extension://${id}/options.html`);
    await opts.waitForLoadState('domcontentloaded');
    // Give CSS + any first paint a beat to land.
    await opts.waitForTimeout(500);
    await shoot(opts, '05-options', OPTIONS);
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log('Capturing PrimeVault screenshots…\n');
  await captureOnboarding();
  await captureVaultList();
  await captureAddEntry();
  await captureUnlock();
  await captureOptions();
  console.log('\nDone. See docs/screenshots/raw/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
