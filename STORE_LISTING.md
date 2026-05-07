# Chrome Web Store Listing — PrimeVault

This file is the source of truth for the listing copy. When the listing on the Chrome Web Store dashboard ever needs to be updated, edit this file first, commit, then copy fields over.

---

## Name

**PrimeVault**

## Short description (≤132 chars)

Encrypted vault for API keys & tokens. Zero-knowledge, open source, lives in your toolbar.

## Category

Developer Tools

## Detailed description

> PrimeVault is a zero-knowledge, local-only Chrome extension for storing API keys, access tokens, and other developer secrets. Click the toolbar icon, unlock with your master password, copy what you need, get back to work.
>
> **Why PrimeVault**
>
> If you've ever pasted an API key into a notes app "just for a minute," this extension is for you. PrimeVault is built for developers who routinely move secrets between terminals, dashboards, and browsers, and who want them out of plaintext sticky notes without spinning up a full enterprise password manager.
>
> **What's in it**
>
> ✓  **Zero-knowledge encryption** — your master password never leaves your device. The vault is encrypted with AES-256-GCM under a key derived via PBKDF2-SHA256 (600,000 iterations).
>
> ✓  **No accounts, no servers** — there is nothing to sign up for. The extension makes zero network requests. Audit the source on GitHub.
>
> ✓  **Local-only by design** — your encrypted vault lives in `chrome.storage.local`. It is never transmitted, never synced, never observed.
>
> ✓  **Auto-lock and auto-clear** — configurable idle timer wipes the in-memory key. Configurable clipboard timer overwrites copied secrets.
>
> ✓  **Encrypted backup + import** — export your vault as an encrypted file you control. Restore on a new machine with the same master password.
>
> ✓  **Keyboard-driven** — `⌘⇧K` (Mac) / `Ctrl+Shift+K` (Win/Linux) opens the popup. Reveal, copy, search are all one click or one keystroke.
>
> ✓  **Open source, MIT-licensed** — the cryptographic code is small and auditable. Build pipeline is reproducible.
>
> **Permissions**
>
> PrimeVault requests only the minimum permissions it needs:
> • `storage` to save the encrypted vault and preferences locally.
> • `alarms` for the auto-lock and clipboard-clear timers.
> • `offscreen` and `clipboardWrite` to overwrite the clipboard after the configured timeout.
>
> No host permissions. No content scripts. No `tabs`, `cookies`, or `webNavigation`. PrimeVault has no idea what websites you visit.
>
> **Recovery**
>
> There is none. If you lose your master password, your vault is unrecoverable. Make a backup. We can't help you, by design — that's what zero-knowledge means.
>
> **Source code, privacy policy, and full design doc**
>
> https://github.com/prime0x2/PrimeVault

## Single-purpose statement

> PrimeVault locally stores user-supplied secrets, encrypted with a key derived from the user's master password, for the user's later retrieval.

This is the answer to "What is the single purpose of your extension?" on the listing form.

## Permission justifications

These are the answers required at submission. One sentence each.

### `storage`

To save the user's encrypted vault and unencrypted preferences in `chrome.storage.local`. This is the entire on-disk state of the extension.

### `alarms`

To run the auto-lock timer (which wipes the in-memory encryption key after a configurable idle period) and the clipboard auto-clear timer reliably across Manifest V3 service worker eviction.

### `offscreen`

Required to run the clipboard-clear step. Manifest V3 service workers cannot use clipboard APIs, so when the auto-clear timer fires PrimeVault opens a transient offscreen document with `reasons: ['CLIPBOARD']` and the justification "Clear clipboard after the configured PrimeVault auto-clear timeout," writes empty text to the clipboard, then closes the document. The offscreen document has no UI, no network access, and is opened only for this single operation.

### `clipboardWrite`

Required to overwrite the user's clipboard with empty text after the user-configured auto-clear timeout, since the offscreen document running this overwrite cannot rely on a user gesture. PrimeVault never reads the clipboard — it only writes empty text on the timer the user set in Settings.

### Host permission justification

**None requested.** PrimeVault has no access to any website. No content scripts, no host permissions, no `tabs`, no `activeTab`. The popup operates entirely on its own state and `chrome.storage.local`.

### Remote code use

**None.** All scripts are bundled at build time. The Content Security Policy explicitly forbids `script-src` from any origin other than `'self'`.

## Listing assets checklist

| Asset | Spec | Status |
|-------|------|--------|
| 128×128 icon | PNG, transparent | ✅ in `public/icon/128.png` |
| 16/32/48/96 icons | PNG | ✅ in `public/icon/` |
| Screenshot 1: unlocked vault | 1280×800 PNG | ⏳ TODO |
| Screenshot 2: add-entry form (expanded) | 1280×800 PNG | ⏳ TODO |
| Screenshot 3: settings page | 1280×800 PNG | ⏳ TODO |
| Screenshot 4: encrypted backup export | 1280×800 PNG (optional) | ⏳ TODO |
| Screenshot 5: empty-state with shortcut hint | 1280×800 PNG (optional) | ⏳ TODO |
| Small promo tile 440×280 | optional | ⏳ TODO |
| Marquee tile 1400×560 | optional | skip for v1 |

Save the screenshots under `docs/store/` so they're versioned with the rest of the listing copy. Re-take them on every visual redesign.

## Privacy policy URL

After publishing, the privacy policy lives at the canonical GitHub Pages URL or the raw GitHub URL of `PRIVACY.md`. Either works for store review.

`https://github.com/prime0x2/PrimeVault/blob/main/PRIVACY.md`

## Submission checklist

- [ ] CI green on `main`
- [ ] `manifest.json` matches `package.json` version
- [ ] Manual QA on a fresh Chrome profile (see README)
- [ ] All screenshots captured at 1280×800 and saved under `docs/store/`
- [ ] `PRIVACY.md` reviewed and dated
- [ ] `STORE_LISTING.md` reviewed
- [ ] Permission justifications copied into the dashboard form
- [ ] First-run flow tested in production build (`pnpm build` then load unpacked)
- [ ] Tag the release: `git tag v1.0.0 && git push --tags`
