#!/usr/bin/env node
/**
 * Pre-submission sanity check.
 *
 * Run this before uploading a build to the Chrome Web Store. It runs the
 * same gates as CI plus a few submission-specific checks that CI doesn't:
 *
 *   - The built manifest's version matches package.json's version.
 *   - The built manifest contains every permission declared in
 *     wxt.config.ts (catches a stale build where someone forgot to rebuild
 *     after editing the config).
 *   - The ZIP artifact actually exists and is non-empty.
 *
 * Exits 0 on success with a one-line "ZIP path" so the next step (manual
 * upload) knows where to grab it. Non-zero on any failure.
 *
 * Usage:
 *   pnpm submit-check
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const outputDir = join(repoRoot, '.output', 'chrome-mv3');
const zipDir = join(repoRoot, '.output');

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function ok(message) {
  console.log(`✓ ${message}`);
}

function run(label, command) {
  console.log(`\n→ ${label}`);
  const result = spawnSync('pnpm', command, {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  if (result.status !== 0) fail(`${label} failed`);
}

console.log('PrimeVault submission check');
console.log('='.repeat(50));

// 1. Run all four gates. Doing this here (rather than just trusting
// last-seen CI) means a fresh local build, with the current working tree.
run('Typecheck', ['exec', 'tsc', '--noEmit']);
run('Lint', ['lint']);
run('Test', ['test']);
run('Build', ['build']);
run('Zip', ['zip']);

// 2. Read both manifests — package.json (source of truth for version)
// and the built manifest (what actually ships).
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const builtManifestPath = join(outputDir, 'manifest.json');
if (!existsSync(builtManifestPath)) {
  fail(`Built manifest not found at ${builtManifestPath}`);
}
const builtManifest = JSON.parse(readFileSync(builtManifestPath, 'utf8'));

// 3. Version match.
if (builtManifest.version !== pkg.version) {
  fail(
    `Version mismatch: package.json = ${pkg.version}, ` +
      `built manifest.json = ${builtManifest.version}. ` +
      `Bump the package.json version (\`pnpm version <patch|minor|major>\`) ` +
      `and rebuild before submitting.`,
  );
}
ok(`Version matches: ${pkg.version}`);

// 4. Reject a v0.0.0 submission — that's the unreleased default.
if (pkg.version === '0.0.0') {
  fail(
    'package.json version is still 0.0.0. The Chrome Web Store accepts ' +
      "this technically, but it's almost certainly a mistake. Run " +
      '`pnpm version 0.1.0` (or whatever) before submitting.',
  );
}
ok('Version is post-default');

// 5. Permissions present and minimal.
const expectedPermissions = [
  'storage',
  'alarms',
  'offscreen',
  'clipboardWrite',
];
const missing = expectedPermissions.filter(
  (p) => !builtManifest.permissions?.includes(p),
);
const unexpected = (builtManifest.permissions ?? []).filter(
  (p) => !expectedPermissions.includes(p),
);
if (missing.length > 0) {
  fail(`Built manifest is missing permissions: ${missing.join(', ')}`);
}
if (unexpected.length > 0) {
  fail(
    `Built manifest has unexpected permissions: ${unexpected.join(', ')}. ` +
      `Add a justification in STORE_LISTING.md before adding any permission.`,
  );
}
ok(`Permissions: ${builtManifest.permissions.join(', ')}`);

// 6. No host permissions.
if (builtManifest.host_permissions?.length > 0) {
  fail(
    `Built manifest declares host_permissions: ${builtManifest.host_permissions.join(
      ', ',
    )}. The store-listing single-purpose claim depends on these being empty.`,
  );
}
ok('No host permissions');

// 7. CSP must not allow remote script.
const csp = builtManifest.content_security_policy?.extension_pages ?? '';
if (csp.includes('unsafe-eval')) {
  fail("CSP allows 'unsafe-eval'. That will fail review.");
}
if (csp.includes('http://') || csp.includes('https://')) {
  fail('CSP appears to permit a remote origin. Production CSP must be self-only.');
}
ok('CSP is self-only');

// 8. Locate the ZIP.
const zips = readdirSync(zipDir).filter((f) => f.endsWith('.zip'));
if (zips.length === 0) {
  fail('No ZIP found under .output/. Did `pnpm zip` succeed?');
}
// Pick the newest one (in case of multiple builds).
const newestZip = zips
  .map((name) => ({ name, mtime: statSync(join(zipDir, name)).mtime }))
  .sort((a, b) => b.mtime - a.mtime)[0];
const zipPath = join(zipDir, newestZip.name);
const zipSize = statSync(zipPath).size;
if (zipSize === 0) fail(`ZIP at ${zipPath} is empty`);
ok(`ZIP: ${newestZip.name} (${(zipSize / 1024).toFixed(1)} KB)`);

// 9. Required listing files exist and aren't empty.
for (const file of ['PRIVACY.md', 'STORE_LISTING.md', 'LICENSE', 'README.md']) {
  const path = join(repoRoot, file);
  if (!existsSync(path) || statSync(path).size === 0) {
    fail(`${file} is missing or empty`);
  }
}
ok('PRIVACY.md, STORE_LISTING.md, LICENSE, README.md all present');

// 10. Manifest fields used by the listing.
if (!builtManifest.homepage_url) fail('Manifest missing homepage_url');
if (!builtManifest.author) fail('Manifest missing author');
ok(`homepage_url: ${builtManifest.homepage_url}`);

console.log('\n' + '='.repeat(50));
console.log(`✓ Ready to submit.`);
console.log(`\nUpload this ZIP to the Chrome Web Store dashboard:`);
console.log(`  ${zipPath}\n`);
console.log(`Dashboard: https://chrome.google.com/webstore/devconsole/`);
console.log(
  `Listing copy: STORE_LISTING.md (open in your editor, copy fields into the form).`,
);
console.log(`Privacy URL: ${builtManifest.homepage_url}/blob/main/PRIVACY.md`);
