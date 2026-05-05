import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';

// Strict CSP for production. Dev mode needs to allow the WXT HMR client to
// connect to the local Vite server over ws:// — production builds don't
// include the HMR client, so the strict variant ships to the store.
const PROD_CSP =
  "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'";
const DEV_CSP =
  "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://localhost:* http://localhost:*";

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  // Persist the dev Chrome profile across `pnpm dev` runs so the unlocked
  // vault, settings, and onboarding state survive between sessions. Without
  // this, WXT spawns Chrome with a fresh profile each run → empty
  // chrome.storage.local → bounces back to the setup screen.
  webExt: {
    chromiumProfile: '.wxt/chrome-data',
    keepProfileChanges: true,
  },
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ mode }) => ({
    name: 'PrimeVault',
    description:
      'Encrypted vault for API keys & tokens. Zero-knowledge, open source, lives in your toolbar.',
    // Manifest hygiene for Chrome Web Store submission. SPEC §15.4.
    homepage_url: 'https://github.com/prime0x2/PrimeVault',
    author: { email: 'prime0x2@gmail.com' },
    // Permission set is intentionally minimal — see STORE_LISTING.md §
    // "Permission justifications" for the one-liner per permission, which
    // is what the store review form asks for.
    //   storage         — encrypted envelope + user prefs (chrome.storage.local)
    //   alarms          — auto-lock + clipboard auto-clear (survives SW eviction)
    //   offscreen       — clipboard auto-clear runs in an offscreen document
    //                     because service workers can't access clipboard APIs
    //   clipboardWrite  — offscreen doc's writeText('') is not in a user-gesture
    //                     context, so the permission must be explicit
    permissions: ['storage', 'alarms', 'offscreen', 'clipboardWrite'],
    action: {
      default_title: 'PrimeVault',
    },
    commands: {
      _execute_action: {
        suggested_key: {
          default: 'Ctrl+Shift+K',
          mac: 'Command+Shift+K',
        },
        description: 'Open PrimeVault',
      },
    },
    content_security_policy: {
      extension_pages: mode === 'production' ? PROD_CSP : DEV_CSP,
    },
  }),
});
