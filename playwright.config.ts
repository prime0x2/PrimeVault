/**
 * Playwright config for the E2E layer. SPEC §11 deferred this to v0.2,
 * but the rebrand + filter chips + scope field are heavy enough UI
 * surface area that the smoke tests carry their weight at v1.0.
 *
 * The tests load the production-built MV3 extension into a real Chromium
 * profile (not the headless shell — extensions don't run there). They
 * intentionally test the BUILT artifact, not the dev build, so a regression
 * caught here is one a Chrome Web Store reviewer would also see.
 *
 * Run: `pnpm build && pnpm test:e2e`. CI runs both steps in series.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  // Per-test timeout. Onboarding does ~600ms of PBKDF2 once for setup +
  // again for unlock; 30s leaves head-room for slow CI machines.
  timeout: 30_000,
  // Forbid `.only` in CI; locally it's a useful quick-iteration tool.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Single worker — the tests share one extension load and one Chromium
  // profile per test. Parallelism would race on the file system and the
  // service worker.
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    // Slow each action down a hair so async UI updates land before the
    // next interaction. Costs ~2-3s across the suite; saves a lot of
    // flaky-test debugging.
    actionTimeout: 5_000,
    trace: 'retain-on-failure',
  },
});
