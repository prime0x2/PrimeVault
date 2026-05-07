#!/usr/bin/env node
/**
 * Bundle-size budget. Run after `pnpm build`. Fails if the popup,
 * background, or options bundles exceed the configured thresholds —
 * cheap insurance against an accidental dependency adding hundreds of KB.
 *
 * Thresholds are deliberately ~25% above current sizes so a real feature
 * has room to land. Tune them up only when a justified increase ships.
 *
 * Run via: `pnpm bundle-size-check` (after `pnpm build`).
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const OUTPUT_DIR = '.output/chrome-mv3';
const CHUNKS_DIR = join(OUTPUT_DIR, 'chunks');

/**
 * Each entry's max size in bytes. The `prefix` matches the rollup-output
 * basename (which is `<entry>-<hash>.js` for hashed chunks, or just
 * `<entry>.js` for unhashed ones like `background.js`).
 */
const BUDGETS = [
  // Bumped 36 → 40 kB after the Direction C theme + filter chip work
  // landed and parked us near the prior ceiling.
  { label: 'popup', prefix: 'popup-', dir: CHUNKS_DIR, maxBytes: 40 * 1024 },
  {
    label: 'options',
    prefix: 'options-',
    dir: CHUNKS_DIR,
    maxBytes: 28 * 1024,
  },
  {
    label: 'background',
    prefix: 'background.js',
    dir: OUTPUT_DIR,
    maxBytes: 110 * 1024,
    exact: true,
  },
];

async function findFile({ prefix, dir, exact }) {
  const entries = await readdir(dir);
  if (exact) {
    return entries.includes(prefix) ? prefix : null;
  }
  return entries.find((name) => name.startsWith(prefix)) ?? null;
}

async function main() {
  let failed = false;

  for (const budget of BUDGETS) {
    const file = await findFile(budget);
    if (!file) {
      console.error(
        `  ✖ ${budget.label}: could not locate '${budget.prefix}*' in ${budget.dir}`,
      );
      failed = true;
      continue;
    }
    const path = join(budget.dir, file);
    const { size } = await stat(path);
    const pct = ((size / budget.maxBytes) * 100).toFixed(0);
    const ok = size <= budget.maxBytes;
    const fmt = `${(size / 1024).toFixed(1)} kB / ${(budget.maxBytes / 1024).toFixed(0)} kB (${pct}%)`;
    console.log(`  ${ok ? '✓' : '✖'} ${budget.label.padEnd(11)} ${fmt}`);
    if (!ok) failed = true;
  }

  if (failed) {
    console.error(
      '\nBundle-size budget exceeded. If the increase is intentional, bump',
    );
    console.error(
      'the relevant `maxBytes` in scripts/bundle-size.mjs in the same PR.',
    );
    process.exit(1);
  }
  console.log('\nAll bundle-size budgets within limits.');
}

await main().catch((err) => {
  console.error(err);
  process.exit(1);
});
