# PrimeVault Privacy Policy

_Last updated: 2026-05-05_

## Summary

**PrimeVault is a zero-knowledge, local-only Chrome extension. It does not collect, transmit, sell, or share any user data. Your secrets never leave your device.**

If you only read one line, that is the line.

---

## What data the extension handles

PrimeVault stores the following on your device, in `chrome.storage.local`:

1. **Your encrypted vault** — every entry's name, value, notes, tags, type, and expiry. Encrypted with AES-256-GCM under a key derived from your master password (PBKDF2-SHA256, 600,000 iterations). The master password itself is never stored.
2. **Your preferences** — theme, accent color, auto-lock duration, clipboard-clear duration, default entry type, shortcut hint visibility. Not encrypted; preferences are not secret.

Neither of these leaves your device. There is no remote server, no analytics endpoint, no error reporter, no telemetry.

## What data the extension does **not** handle

- We do **not** read your browsing history, tabs, page contents, cookies, or anything else outside of `chrome.storage.local`.
- We do **not** request host permissions. PrimeVault has no access to any website you visit.
- We do **not** include third-party SDKs, trackers, ad libraries, or analytics.
- We do **not** make any network requests. The extension's Content Security Policy explicitly forbids `connect-src` to anything but `'self'`.

## How encryption works

- **Key derivation:** PBKDF2-SHA256 with 600,000 iterations, 16-byte random salt generated at vault setup.
- **Encryption:** AES-256-GCM with a fresh 12-byte random IV on every save. The envelope's schema version is bound to the ciphertext as authenticated additional data (AAD), so silent format-version tampering is impossible.
- **Password verification:** "Decrypt to verify." There is no separate password hash. On unlock, we attempt to decrypt the stored ciphertext; the GCM authentication tag tells us whether the password was correct. This avoids exposing a second offline brute-force target.
- **Recovery:** None. If you lose your master password, your vault is permanently unrecoverable. This is the cost of zero-knowledge encryption.

The full cryptographic design and threat model live in [`SPEC.md`](./SPEC.md) §3 and §4.

## Permissions

PrimeVault requests the minimum permissions necessary to function:

| Permission | Why we ask for it |
|------------|-------------------|
| `storage` | To save the encrypted vault and your preferences locally via `chrome.storage.local`. |
| `alarms` | To run the auto-lock timer and clipboard auto-clear timer reliably across service worker restarts. |
| `offscreen` | To clear the clipboard after the configured timeout. Service workers can't call clipboard APIs directly, so we use a transient offscreen document. |
| `clipboardWrite` | The offscreen-document clipboard clear is a non-user-gesture write and requires this permission. |

We do **not** request: `tabs`, `activeTab`, host permissions (e.g. `*://*/*`), `cookies`, `webNavigation`, `scripting`, `contextMenus`, `unlimitedStorage`, or any other broad-access permission.

## Data retention and deletion

- Your vault stays on your device until you uninstall the extension or click **Settings → Reset vault**.
- Resetting the vault wipes the encrypted envelope from `chrome.storage.local`. Your preferences are kept (they are not secret).
- Uninstalling the extension removes everything PrimeVault has stored.
- We never receive or retain any data, so there is nothing for us to delete on your behalf.

## Compliance with Chrome Web Store user data policy

Per Google's user data policy disclosures:

- **We do not transmit user data** anywhere. The extension makes no network requests.
- **We do not sell user data.** We have no business relationship with anyone in which user data could be exchanged.
- **We do not use user data for advertising** or any non-product purpose.
- **We do not transfer user data** to third parties.

PrimeVault complies with Chrome's "Limited Use" requirements by never collecting user data in the first place.

## Open source

PrimeVault is MIT-licensed and developed in the open at [github.com/prime0x2/PrimeVault](https://github.com/prime0x2/PrimeVault). The build pipeline is reproducible (Node version pinned via `.nvmrc`, pnpm with frozen lockfile in CI). You can audit the cryptographic code in `src/crypto/` and verify that the published extension matches the source.

## Contact

For privacy questions or to report a security issue, open an issue at [github.com/prime0x2/PrimeVault/issues](https://github.com/prime0x2/PrimeVault/issues) or email **prime0x2@gmail.com**.

## Changes to this policy

If this policy ever changes substantively, we will:

1. Update the `Last updated` date at the top of this file.
2. Note the change in the GitHub release notes.
3. Surface a one-time notice in the extension's options page.

Material changes will never expand the data we collect or transmit beyond "none."
