/**
 * Composite each raw popup screenshot onto a 1280×800 brand frame for the
 * Chrome Web Store listing. The frame template (frame.html) handles layout
 * and typography; this script just runs Playwright across the 5 shots.
 *
 * Usage: `pnpm frame-shots` (after `pnpm capture-shots` has produced raws).
 *
 * Outputs: docs/screenshots/{NN-name}.png at 1280×800.
 *
 * The frame uses the dark/Direction-B vocabulary (radial gradient on warm
 * black, phosphor-green ticks, Geist + Geist Mono) — same palette as
 * docs/brand/social-dark.png so a CWS visitor sees a consistent identity.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');
const RAW_DIR = resolve(ROOT, 'docs/screenshots/raw');
const OUT_DIR = resolve(ROOT, 'docs/screenshots');
const FRAME_TEMPLATE = pathToFileURL(join(__dirname, 'frame.html')).href;

// Per-shot copy. Eyebrow is short caps; headline is the punch; sub elaborates
// in one or two sentences. Kept tight — CWS thumbnails are small and the
// reader scans first, reads second.
const SHOTS = [
  {
    raw: '01-onboarding.png',
    out: '01-onboarding.png',
    w: 380,
    h: 560,
    eyebrow: 'Zero knowledge',
    headline: 'One master key.\nNo recovery.',
    sub: 'Your password never leaves the device. The vault is encrypted client-side with AES-256-GCM under a PBKDF2-derived key.',
  },
  {
    raw: '02-vault-list.png',
    out: '02-vault-list.png',
    w: 380,
    h: 560,
    eyebrow: 'Every kind',
    headline: 'All your secrets,\none toolbar away.',
    sub: 'API keys, tokens, passwords, secrets — scoped per project, expiry-aware, searchable. Click to copy; the clipboard auto-clears.',
  },
  {
    raw: '03-add-entry.png',
    out: '03-add-entry.png',
    w: 380,
    h: 560,
    eyebrow: 'Rich metadata',
    headline: 'Stash a secret\nin seconds.',
    sub: 'Kind, scope, expiry, tags, notes — all encrypted, all searchable. Future-you will know exactly what each value is for.',
  },
  {
    raw: '04-unlock.png',
    out: '04-unlock.png',
    w: 380,
    h: 560,
    eyebrow: 'Local only',
    headline: 'No accounts.\nNo servers.',
    sub: "The encrypted vault lives in chrome.storage.local. Zero network requests, zero telemetry — and the source is auditable.",
  },
  {
    raw: '05-options.png',
    out: '05-options.png',
    w: 720,
    h: 900,
    eyebrow: 'Tunable',
    headline: 'Auto-lock.\nAuto-clear.',
    sub: "An idle timer wipes the in-memory key. After every copy, the clipboard is overwritten. Both timers are yours to set.",
  },
];

function buildUrl(shot) {
  const popupUrl = pathToFileURL(join(RAW_DIR, shot.raw)).href;
  const params = new URLSearchParams({
    popup: popupUrl,
    index: shot.out.slice(0, 2),
    total: String(SHOTS.length).padStart(2, '0'),
    eyebrow: shot.eyebrow,
    headline: shot.headline,
    sub: shot.sub,
    w: String(shot.w),
    h: String(shot.h),
  });
  return `${FRAME_TEMPLATE}?${params.toString()}`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const shot of SHOTS) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      await page.goto(buildUrl(shot));
      await page.waitForFunction(
        () => document.body.dataset.ready === 'true',
        { timeout: 10_000 },
      );
      const out = join(OUT_DIR, shot.out);
      await page.screenshot({
        path: out,
        clip: { x: 0, y: 0, width: 1280, height: 800 },
      });
      await ctx.close();
      console.log(`  ✓ ${shot.out.padEnd(20)} → docs/screenshots/${shot.out}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
