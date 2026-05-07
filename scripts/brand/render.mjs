/**
 * Render brand templates (icon / social card / README hero) to PNG using
 * the headless Chromium that ships with Playwright. The templates live as
 * standalone HTML files alongside this script; we load each one with the
 * appropriate query string, wait for `document.body.dataset.ready === 'true'`,
 * and screenshot at the exact pixel dimensions the design specifies.
 *
 * Usage: `pnpm build:brand`
 *
 * Outputs:
 *   public/icon/{16,32,48,96,128}.png   ← the live extension icon (Ember variant)
 *   docs/brand/icon-{ember,dark}-{N}.png ← reference set for both variants
 *   docs/brand/social-{dark,light}.png   ← 1280×640 GitHub social preview
 *   docs/brand/readme-hero-{dark,light}.png ← 1280×360 README banner
 */
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

const ICON_TEMPLATE = pathToFileURL(join(__dirname, 'icon.html')).href;
const SOCIAL_TEMPLATE = pathToFileURL(join(__dirname, 'social.html')).href;
const HERO_TEMPLATE = pathToFileURL(join(__dirname, 'hero.html')).href;

// Ember is the live toolbar icon. Dark is shipped as a reference companion.
const LIVE_ICON_VARIANT = 'ember';
const ICON_SIZES = [16, 32, 48, 96, 128];

const jobs = [];

// Live icons → public/icon/. WXT auto-discovers icons here from the file names.
for (const size of ICON_SIZES) {
  jobs.push({
    label: `live icon ${size}`,
    url: `${ICON_TEMPLATE}?variant=${LIVE_ICON_VARIANT}&size=${size}`,
    width: size,
    height: size,
    out: `public/icon/${size}.png`,
    omitBackground: true,
  });
}

// Reference set for both variants → docs/brand/.
for (const variant of ['ember', 'dark']) {
  for (const size of ICON_SIZES) {
    jobs.push({
      label: `ref icon ${variant} ${size}`,
      url: `${ICON_TEMPLATE}?variant=${variant}&size=${size}`,
      width: size,
      height: size,
      out: `docs/brand/icon-${variant}-${size}.png`,
      omitBackground: true,
    });
  }
}

for (const variant of ['dark', 'light']) {
  jobs.push({
    label: `social ${variant}`,
    url: `${SOCIAL_TEMPLATE}?variant=${variant}`,
    width: 1280,
    height: 640,
    out: `docs/brand/social-${variant}.png`,
  });
  jobs.push({
    label: `hero ${variant}`,
    url: `${HERO_TEMPLATE}?variant=${variant}`,
    width: 1280,
    height: 360,
    out: `docs/brand/readme-hero-${variant}.png`,
  });
}

async function main() {
  // Make sure both output dirs exist before we start writing.
  await mkdir(resolve(ROOT, 'public/icon'), { recursive: true });
  await mkdir(resolve(ROOT, 'docs/brand'), { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const job of jobs) {
      const ctx = await browser.newContext({
        viewport: { width: job.width, height: job.height },
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      await page.goto(job.url);
      await page.waitForFunction(
        () => document.body.dataset.ready === 'true',
        { timeout: 10_000 },
      );
      const outPath = resolve(ROOT, job.out);
      await page.screenshot({
        path: outPath,
        omitBackground: !!job.omitBackground,
        clip: { x: 0, y: 0, width: job.width, height: job.height },
      });
      await ctx.close();
      console.log(`  ✓ ${job.label.padEnd(20)} → ${job.out}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
