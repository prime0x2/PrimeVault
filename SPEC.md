# PrimeVault — Chrome Extension Spec

> A zero-knowledge, password-protected vault for storing API keys, tokens, and other secrets, with one-click copy from the browser toolbar.

**Status:** v1 design spec
**Owner:** M. Prime (prime0x2@gmail.com)
**Date:** 2026-05-04
**Working name:** PrimeVault (final, may revise before store submission)

---

## 1. Product summary

PrimeVault is a Chrome extension that lives in the user's pinned toolbar. Click the icon → popup → unlock with master password → search/copy/edit/add/delete entries. Each entry has a name, secret value, and optional metadata (notes, tags, type, expiration). All data is encrypted client-side with a key derived from the master password. Nothing leaves the device. No accounts, no servers, no telemetry.

### Target user

Developers who routinely paste API keys, tokens, and secrets between terminals, browsers, and dashboards, and want them out of plaintext notes apps without spinning up a full password manager.

### Differentiators

- **Zero-knowledge** — encryption key is derived from the master password; the extension cannot recover data without it.
- **Open source** — auditable crypto and build pipeline.
- **Zero network** — no analytics, no error reporting, no remote code, no sync server.
- **Developer-shaped UX** — fast keyboard-driven flow, masked-by-default values, auto-clearing clipboard.

---

## 2. Tech stack

| Concern              | Choice                                                          |
| -------------------- | --------------------------------------------------------------- |
| Framework            | **WXT** (extension framework) + **React 19** + **TypeScript 5** |
| Bundler              | Vite (via WXT)                                                  |
| Styling              | **Tailwind CSS v4** + **shadcn/ui** (copy-paste primitives)     |
| Forms                | React Hook Form + Zod                                           |
| State (in-popup)     | Zustand (small, no providers, plays well with React 19)         |
| Linter / Formatter   | **Biome 2.x** (replaces ESLint + Prettier)                      |
| Package manager      | **pnpm**                                                        |
| Tests                | **Vitest** (unit only, see §11)                                 |
| Crypto               | WebCrypto (PBKDF2 + AES-GCM)                                    |
| Password strength    | `zxcvbn-ts` (lazy-loaded on setup screen)                       |
| Manifest             | **Manifest V3**                                                 |
| Repo                 | Public on GitHub, **MIT license**                               |
| CI                   | GitHub Actions                                                  |
| Node                 | LTS (≥22)                                                       |

---

## 3. Threat model

In scope:

- A web page running in any tab cannot read PrimeVault data (extension origin isolation).
- A casual physical attacker who finds the laptop unlocked has limited time before the vault auto-locks.
- An attacker who exfiltrates `chrome.storage.local` from disk gets only ciphertext. The master password is needed to decrypt; PBKDF2 with 600k iterations makes brute force expensive.
- Forgot-password = data loss. This is by design.

**Out of scope (v1):**

- Defense against malware running with the user's privileges (it can read decrypted memory and the clipboard regardless).
- Defense against another malicious Chrome extension installed by the user. Extensions are origin-isolated from each other, but a sufficiently privileged malicious extension is essentially a local attacker.
- Hardware-backed key storage (no platform key vault integration).
- Sync, sharing, or any multi-device feature.

---

## 4. Cryptographic design

### 4.1 Key derivation

- **KDF:** PBKDF2-SHA256 via WebCrypto's `crypto.subtle.deriveKey`.
- **Iterations:** **600,000** (OWASP 2023 recommendation for PBKDF2-SHA256).
- **Salt:** 16 random bytes from `crypto.getRandomValues`, generated once at vault setup, stored alongside the ciphertext.
- **Output:** 256-bit AES-GCM key.

### 4.2 Encryption

- **Cipher:** AES-256-GCM via WebCrypto.
- **IV:** 12 random bytes per encryption operation. Never reused with the same key.
- **AAD:** the envelope's `version` field is bound as additional authenticated data, so an attacker cannot downgrade the version field without breaking the auth tag.
- **What is encrypted:** the entire `VaultPlaintext` object (see §5.2) is serialized to JSON and encrypted as a single blob. v1 does not encrypt entries individually — simpler, no risk of metadata-leak through entry boundaries.

### 4.3 Password verification

**Decrypt-to-verify.** No separate password hash is stored. On unlock attempt: derive key, attempt to decrypt the stored ciphertext. If GCM auth-tag verification fails, the password is wrong. This matches Bitwarden's approach and avoids exposing a second offline brute-force target.

### 4.4 Re-prompt for sensitive actions

These actions re-prompt the master password (a password check, not a full re-unlock):

- Encrypted backup export
- Plaintext backup export (also gated by an "I understand the risks" checkbox)
- Change master password
- Reset vault (destroy all data)
- Show recovery debug info (if any is ever added)

Re-prompt uses the same decrypt-to-verify mechanism against a small canary blob (or the full vault), no separate hash.

### 4.5 Change master password

1. Re-prompt current password → derive old key → decrypt vault to plaintext in memory.
2. Generate **new** salt + new IV.
3. Derive new key from new password.
4. Encrypt plaintext under new key with new IV. Bump envelope `kdf.salt` only — version stays the same.
5. Atomic write (see §6.4). Old ciphertext discarded only after the new write is confirmed.

### 4.6 Reset vault

Confirmation dialog with a typed phrase ("RESET" or similar). Wipes `chrome.storage.local` keys for the vault and any cached state. Does **not** wipe user preferences (theme, auto-lock duration) — those live under separate keys and are not encrypted.

---

## 5. Data model

### 5.1 Encrypted envelope (what's actually stored on disk)

```ts
type Envelope = {
  /** Envelope schema version. Increment on breaking on-disk format changes. */
  version: 1;
  /** KDF parameters. Stored so we can change them later without re-prompting until next save. */
  kdf: {
    algo: 'PBKDF2-SHA256';
    iterations: 600_000;
    salt: string; // base64, 16 bytes
  };
  cipher: {
    algo: 'AES-GCM';
    iv: string;         // base64, 12 bytes, regenerated on every write
    ciphertext: string; // base64
  };
  /** Unencrypted, used to detect schema drift before attempting decrypt. */
  createdAt: string; // ISO
  updatedAt: string; // ISO
};
```

The `version` field is used as AES-GCM AAD so it cannot be silently changed.

### 5.2 Decrypted plaintext (in-memory only, after unlock)

```ts
type VaultPlaintext = {
  /** Inner schema version, used by the migration chain (separate from envelope.version). */
  schemaVersion: 1;
  entries: Entry[];
};

type Entry = {
  id: string;          // ULID — sortable, no central registry needed
  name: string;        // 1–80 chars, required, unique among entries (case-insensitive)
  value: string;       // 1–8192 chars, required (the secret itself)
  notes?: string;      // up to 2000 chars
  tags: string[];      // 0–10 tags, each 1–24 chars, lowercase normalized
  kind: EntryKind;     // 'api_key' | 'token' | 'password' | 'secret' | 'other'
  expiresAt?: string;  // ISO date (no time), optional
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
  lastUsedAt?: string; // ISO, updated on copy
  copyCount: number;   // monotonic, incremented on copy
};
```

### 5.3 Unencrypted user preferences (separate `chrome.storage.local` key)

```ts
type Prefs = {
  prefsVersion: 1;
  theme: 'system' | 'light' | 'dark';
  accent: 'slate' | 'violet' | 'green'; // see §10.1
  autoLockMinutes: 0 | 1 | 2 | 5 | 15 | 60; // 0 = never (until browser quit)
  clipboardClearSeconds: 0 | 15 | 30 | 60; // 0 = never
  defaultEntryKind: EntryKind;
  shortcutHint: boolean; // show "Cmd+Shift+K" hint on empty list
};
```

Prefs are not secret and are stored unencrypted to allow the popup to render its first frame (theme, layout) before unlock.

---

## 6. Storage

### 6.1 Backend

`chrome.storage.local` only. No `chrome.storage.sync` (its 100KB limit is too tight, and exposing ciphertext to Google's sync layer is not free).

### 6.2 Keys

| Key                  | Contents                                                           |
| -------------------- | ------------------------------------------------------------------ |
| `pv:envelope`        | The `Envelope` (see §5.1), or absent if vault not yet set up.      |
| `pv:prefs`           | The `Prefs` object (see §5.3).                                     |
| `pv:meta`            | Misc: `installedAt`, `lastSchemaCheckAt`, etc.                     |

### 6.3 Decrypted-key cache (NOT in storage)

The derived AES key is held only in the **service worker's** memory (`globalThis`), with an `expiresAt` timestamp. The popup talks to the service worker via `chrome.runtime.sendMessage` to encrypt/decrypt; the popup never holds the key longer than a single render path. When auto-lock fires, the service worker zeroes its key reference.

The service worker can be torn down by Chrome at any time. If it's torn down with the key in memory, the key is lost — the user is silently logged out, which is the safe behavior. Exception: see §7.3 for `chrome.storage.session` consideration.

### 6.4 Atomic writes

`chrome.storage.local.set` is atomic per key. Multi-step operations (change master password, schema migrations) write to a temporary key first (`pv:envelope.next`), then swap-and-delete. Crash-safety is verified on each unlock by checking for a leftover `.next` key.

### 6.5 Schema migrations

Forward-only migration chain on the **decrypted plaintext** (`schemaVersion`):

```ts
type Migration<From, To> = (input: From) => To;
const migrations: Record<number, Migration<any, any>> = {
  // 1: () => ..., // first migration would live here when schemaVersion bumps to 2
};
```

On unlock:

1. Decrypt envelope → plaintext.
2. While `plaintext.schemaVersion < CURRENT_SCHEMA`, apply `migrations[plaintext.schemaVersion]`.
3. Validate with Zod against the current schema.
4. If validation fails, surface a "Vault data appears corrupted — restore from backup?" screen. Do not auto-wipe.

The envelope's own `version` is bumped only for breaking changes to the **on-disk format** (e.g., switching KDF). Inner `schemaVersion` is bumped for changes to the entry shape.

---

## 7. Auto-lock and session lifecycle

### 7.1 States

- **Uninitialized** — no envelope on disk. Popup shows onboarding (§9).
- **Locked** — envelope on disk, no key in memory. Popup shows unlock screen.
- **Unlocked** — key in service worker memory with `expiresAt > now`. Popup shows the vault.

### 7.2 Auto-lock policy

- Default: **2 minutes** of idleness (see options below).
- "Idle" = no message has been sent to the service worker (open popup, copy, search, etc.).
- Each interaction resets the timer.
- User-configurable in Settings: Never (until browser quit) / 1 / 2 / 5 / 15 / 60 minutes.

### 7.3 Persistence across service worker restarts

By default, when Chrome tears down the service worker, the key is lost — the user re-unlocks. This is the safest default and we ship with it.

(Future option, **NOT** in v1: stash the derived key in `chrome.storage.session` to survive SW restarts within the same browser session. That key is held only in browser memory and is wiped on browser exit, but it does extend the key's lifetime beyond intended idle timeouts unless we also store an expiry. Decision: skip for v1, revisit if SW eviction makes the UX painful.)

### 7.4 Manual lock

- "Lock" button in popup header.
- Triggered automatically on Settings → Reset vault, on import, on change-password completion.

---

## 8. Surfaces

### 8.1 Action popup (primary)

- **Size:** 380px wide × 560px tall, fixed.
- **Contents:** see §10.

### 8.2 Options page

Opened from the popup's "Settings" gear (also accessible at `chrome://extensions` → "Extension options"). Full-tab view with sections:

- **Security** — auto-lock duration, clipboard auto-clear, change master password, reset vault.
- **Appearance** — theme (system/light/dark), accent.
- **Backup** — encrypted export, encrypted import, plaintext export (gated).
- **About** — version, license, link to GitHub repo, link to privacy policy.

### 8.3 Keyboard shortcut

- **Default:** `Cmd+Shift+K` (macOS) / `Ctrl+Shift+K` (Windows/Linux). Mnemonic: K for Key.
- Declared via `manifest.json` `commands._execute_action`.
- User can rebind at `chrome://extensions/shortcuts`.
- Empty-state hint shown in popup until the user has saved their first entry.

### 8.4 Context menus, content scripts, omnibox

**None in v1.** No content scripts means no host permissions, which radically simplifies the privacy story for store review.

---

## 9. First-run / onboarding

Single popup screen, no separate tab:

```
┌──────────────────────────────────────┐
│  PrimeVault                          │
│                                      │
│  Create a master password.           │
│  This unlocks your vault.            │
│  We can't recover it if you lose it. │
│                                      │
│  Password:        [........]         │
│  Confirm:         [........]         │
│                                      │
│  Strength: ████████░░ Strong         │
│  Estimated crack time: centuries     │
│                                      │
│  [ Create vault ]                    │
└──────────────────────────────────────┘
```

- `zxcvbn-ts` is lazy-imported only on this screen (~200KB, never shipped to the steady-state popup bundle).
- Min score: **3 out of 4**. Submit button stays disabled until met and "Confirm" matches.
- On submit: generate salt, derive key, encrypt empty vault, write envelope, transition to Unlocked state, land on empty-list view.

---

## 10. UI specification

### 10.1 Theme

- **System-aware** by default (CSS `prefers-color-scheme`), with manual override (light / dark / system) in Settings.
- **Accent themes:** Slate (default, neutral), Violet, Green. Surface as a 3-swatch picker in Settings.
- Tailwind v4 CSS-first config: define `--color-accent-*` and use `@theme inline` to derive shades. Single accent variable swap = full theme change.
- Use `oklch()` color space for sane perceptual contrast across light/dark.

### 10.2 Popup layout

```
┌──────────────────────────────────────────┐  ← 380×560
│  ●  PrimeVault       [⚙] [🔒]            │  Header (40px)
├──────────────────────────────────────────┤
│  Add a new entry                         │
│  ┌────────────────────────────────────┐  │
│  │ Name                               │  │
│  │ [_______________________________]  │  │  Add form (collapsed/expanded)
│  │ Value                              │  │
│  │ [_______________________________]  │  │
│  │ [+ More fields ▾]                  │  │  ← reveals notes/tags/kind/expires
│  │              [Cancel]   [ Save ]   │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  🔍 Search                          11   │  Search row + count
├──────────────────────────────────────────┤
│  GitHub PAT              [👁] [📋] [⋯]   │  Entry row
│  ●●●●●●●●●●●●●●●●                        │
│  ─────────────────────────────────────── │
│  Stripe live key                         │
│  ●●●●●●●●●●●●●●●●  ⚠ expires in 12d     │
│  …                                       │
└──────────────────────────────────────────┘
```

- **Header:** logo+name (left), Settings gear and Lock button (right).
- **Add form:** collapsed by default to a single "+ Add entry" button. Expands inline when clicked. "More fields" expander reveals notes (textarea), tags (chip input), kind (select), expiresAt (date input).
- **Search:** filters by name (always) and tags (if any tags set). Live filter, no submit button. Shows match count on the right.
- **Entry row:**
  - Name on top.
  - Masked value (`•` × value length, capped at 16) below.
  - Action icons on the right: reveal (eye), copy (clipboard), more (kebab → Edit / Delete).
  - Click row body = expand inline to show notes, tags, kind, expiresAt, last copied at, and an Edit button.
  - Expiry warning chip (orange < 14 days, red < 0 days).
- **Empty state:** "Your vault is empty. Add your first secret above." + keyboard shortcut hint.

### 10.3 Reveal

- Click eye icon → value shown plaintext for **8 seconds**, then auto-mask.
- Revealing one entry auto-masks any other revealed entry (only one revealed at a time).

### 10.4 Copy

- Click copy icon → write `value` to clipboard via `navigator.clipboard.writeText`.
- Toast: "Copied — clears in 30s" (text reflects current setting).
- Copy icon flashes to a check for ~1s.
- Bump `lastUsedAt` (now) and `copyCount` (+1). Re-encrypt the vault.
- Schedule a `chrome.alarms` alarm to clear the clipboard after the configured timeout. Clearing is best-effort and silently no-ops if the user has copied something else in the meantime (we don't read the clipboard to check; we just overwrite with empty string only if our own write is still there — implementation note: stash a marker, or use an alarms-based unconditional `writeText('')` and accept the rare overwrite. Decision: **unconditional clear on alarm**, since the user opted in. Document this clearly in Settings.)

### 10.5 Edit

- Inline form replacing the entry row, pre-filled. Same fields as Add. Save / Cancel.

### 10.6 Delete

- Confirmation dialog ("Delete 'GitHub PAT'? This cannot be undone."). Destructive button styled red.

### 10.7 Search / filter

- Top of list. Debounced 80ms.
- Match against `name` (substring, case-insensitive) and `tags` (exact).
- No fancy fuzzy match in v1.

### 10.8 Sort order

- Default: `lastUsedAt` desc, then `updatedAt` desc, then `name` asc.
- Future: settings option for "by name" or "most copied". Not in v1; the schema has the data ready.

### 10.9 Toast / notification primitives

- shadcn `<Sonner />` toaster for success/info.
- shadcn `<AlertDialog />` for destructive confirmations and password re-prompts.

### 10.10 Accessibility

- All interactive elements keyboard-reachable, labeled.
- `aria-live="polite"` for toasts.
- Focus trap on dialogs.
- Reveal/copy buttons have `aria-label` ("Reveal value for GitHub PAT", "Copy value for GitHub PAT").
- Color-not-sole-signal for expiry warnings (icon + label, not only color).
- Respect `prefers-reduced-motion` (no toast slide animations when set).

---

## 11. Testing strategy

**Vitest unit tests, scoped to high-stakes code paths:**

- `crypto/kdf.ts` — known-answer tests for PBKDF2 (verify against RFC 6070-style fixtures or independent reference).
- `crypto/aead.ts` — encrypt → decrypt round-trip, wrong-password rejection, AAD tamper detection.
- `storage/envelope.ts` — atomic write + crash recovery (simulate `pv:envelope.next` leftovers).
- `storage/migrations.ts` — every registered migration has tests with golden input/output.
- `storage/zod-schemas.ts` — boundary cases (max-length name, tag normalization).

**Not in v1:**

- Playwright / browser E2E (high setup cost; deferred to v2).
- Visual regression.

CI runs `pnpm biome check` + `pnpm vitest run` + `pnpm wxt build` on every PR.

---

## 12. CI/CD and release pipeline

### 12.1 Branches and PRs

- `main` is always releasable.
- All work via PRs. Required checks: lint, test, build.

### 12.2 Workflows (GitHub Actions)

- `ci.yml` — runs on PR and pushes to `main`. Jobs: `lint`, `test`, `build`.
- `release.yml` — runs on `v*` tag. Jobs: build → zip → attach `.zip` to a GitHub Release with the changelog.

### 12.3 Versioning

- Semver, `vMAJOR.MINOR.PATCH`.
- `manifest.json` `version` is generated from `package.json` `version` at build time by WXT.

### 12.4 Chrome Web Store submission

- **Manual upload** for v1 (the first review is a moving target; automation is brittle).
- Future (`v0.2`+): `chrome-webstore-upload-cli` step in `release.yml`, gated behind a `CWS_RELEASE` repo secret.

### 12.5 Reproducible builds

- Pinned Node version via `.nvmrc` and `engines.node`.
- pnpm with frozen lockfile in CI.
- `pnpm wxt build && pnpm wxt zip` produces deterministic output (modulo timestamps).

---

## 13. Manifest V3

### 13.1 Permissions

| Permission        | Reason                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `storage`         | `chrome.storage.local` for the encrypted envelope and prefs.                                 |
| `alarms`          | Auto-lock timer + clipboard-clear timer (survive SW eviction).                               |
| `clipboardWrite`  | Implicit when calling `navigator.clipboard.writeText` from the popup (user-gesture context). |

**Explicitly NOT requested:**

- No `tabs`, `activeTab`, host permissions, `cookies`, `webNavigation`, `scripting`, `contextMenus`, etc.
- No `unlimitedStorage` (not needed; chrome.storage.local default quota is sufficient).

This minimal permission set is a major Chrome Web Store review credibility signal.

### 13.2 Content Security Policy

```jsonc
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
  }
}
```

- No `unsafe-eval`.
- No CDN font, image, or script. All assets bundled.
- `'unsafe-inline'` for styles is acceptable (Tailwind injects inline styles; no inline scripts).

### 13.3 Background

- A single MV3 service worker (`background.ts`).
- Responsibilities: hold the derived key in memory; receive `encrypt` / `decrypt` / `unlock` / `lock` / `isUnlocked` messages from the popup; manage idle alarms.
- All crypto operations happen in the service worker. The popup never sees the raw key.

### 13.4 Commands

```jsonc
{
  "commands": {
    "_execute_action": {
      "suggested_key": { "default": "Ctrl+Shift+K", "mac": "Command+Shift+K" }
    }
  }
}
```

---

## 14. Repository layout

```
primevault/
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
├── src/
│   ├── entrypoints/
│   │   ├── background.ts          # service worker
│   │   ├── popup/
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   └── App.tsx
│   │   └── options/
│   │       ├── index.html
│   │       ├── main.tsx
│   │       └── App.tsx
│   ├── components/                # shadcn primitives + app components
│   ├── features/
│   │   ├── unlock/                # unlock & onboarding screens
│   │   ├── vault-list/            # entry list + search + reveal/copy
│   │   ├── add-entry/             # add/edit form
│   │   └── settings/              # options sections
│   ├── crypto/
│   │   ├── kdf.ts                 # PBKDF2 wrapper
│   │   ├── aead.ts                # AES-GCM wrapper
│   │   └── envelope.ts            # encode/decode the on-disk envelope
│   ├── storage/
│   │   ├── client.ts              # typed chrome.storage.local wrapper
│   │   ├── prefs.ts               # Prefs read/write
│   │   ├── vault.ts               # high-level vault read/write (decrypt → ops → encrypt)
│   │   ├── migrations.ts          # forward-only migration chain
│   │   └── schema.ts              # Zod schemas for plaintext + envelope
│   ├── messaging/
│   │   ├── protocol.ts            # message type definitions
│   │   ├── client.ts              # popup-side sender
│   │   └── server.ts              # service-worker-side handler
│   ├── lib/
│   │   ├── ulid.ts
│   │   ├── tags.ts                # tag normalization
│   │   └── strength.ts            # zxcvbn-ts wrapper, lazy-loaded
│   └── styles/
│       └── globals.css            # Tailwind v4 entry, theme tokens
├── public/
│   └── icons/                     # 16/32/48/128 PNGs
├── tests/
│   └── ...                        # Vitest unit tests
├── wxt.config.ts
├── biome.json
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── README.md
├── PRIVACY.md                     # privacy policy stub
├── STORE_LISTING.md               # listing copy stub
├── LICENSE                        # MIT
└── SPEC.md                        # this file
```

---

## 15. Chrome Web Store submission checklist

**Stubbed in repo so submission isn't a scramble.**

### 15.1 Listing assets

- App name: PrimeVault
- Short description (≤132 chars): "Encrypted vault for API keys & tokens. Zero-knowledge, open source, lives in your toolbar."
- Detailed description (in `STORE_LISTING.md`)
- 1× 128×128 PNG icon (also smaller variants)
- 1–5× 1280×800 or 640×400 screenshots (popup unlocked / popup adding entry / settings)
- Optional: small promo tile, marquee promo tile

### 15.2 Privacy

- `PRIVACY.md` published in the repo and linked from the listing.
- Single-purpose statement: "Locally stores user-supplied secrets, encrypted, for the user's later retrieval."
- "Limited use" disclosure (per Chrome's user data policy):
  - We do not transmit user data anywhere.
  - We do not sell user data.
  - We do not use user data for advertising.

### 15.3 Permissions justification (required at submission)

Each requested permission gets a one-sentence justification matching §13.1.

### 15.4 Manifest hygiene

- `name`, `description`, `version` match listing.
- `homepage_url` → GitHub repo.
- `author` → name/handle.
- No `*` host permissions.
- No `web_accessible_resources` unless we ever ship one (we won't in v1).

### 15.5 Pre-submission tests

- Install unpacked, exercise every flow (onboard → add → copy → reveal → edit → delete → settings → lock → unlock → wrong password → reset).
- Run on Chrome stable, latest version.
- Test in a fresh profile (catches "I assumed prior state" bugs).

---

## 16. Out of scope for v1 (parking lot)

- Sync across devices (would need an E2E-encrypted relay or `chrome.storage.sync` + chunking).
- Sharing entries with other users.
- Auto-fill on web pages (would require host permissions and content scripts).
- Browser-context "open the dashboard for this token" smart actions.
- Mobile / Firefox / Safari ports.
- Passkey / WebAuthn unlock as alternative to master password.
- Recovery key / recovery passphrase.
- Pin favorites / drag-to-reorder.
- Categories beyond tags (folders).
- Importers (1Password CSV, .env files, clipboard parser).
- Telemetry / error reporting.
- Audit log / "show recent copies".
- Sort options in UI.

These are tracked here so that v1 stays small and shippable, with clear "we know about it" answers when reviewers or users ask.

---

## 17. Open questions / risks

1. **Service worker eviction frequency.** If Chrome aggressively tears down the SW, the user will re-unlock more often than the 15-minute timer suggests. If real-world UX is bad, revisit `chrome.storage.session` for the key (§7.3).
2. **Clipboard auto-clear robustness.** The unconditional clear-on-alarm approach (§10.4) can clobber a value the user copied from elsewhere within the 30s window. Document clearly. Optional v1.x: only clear if the clipboard still equals the value we wrote (requires a clipboard read, more complex permission story).
3. **PBKDF2 vs Argon2id long-term.** PBKDF2 with 600k iterations is fine for v1. If GPU-attack concerns materialize, plan a one-shot migration: bump envelope `version` to 2, prompt user on next unlock, derive new key with Argon2id, re-encrypt.
4. **MV3 lifecycle gotchas.** First WXT project for the author. Reserve buffer time for SW-related debugging.
5. **Chrome Web Store review variance.** "Single purpose" and "minimum permissions" criteria are interpreted differently by different reviewers. Stub `PRIVACY.md` and permissions justifications early.

---

## 18. Build order (suggested implementation phases)

These are not separate releases — just an ordering for getting v1 done without thrashing.

1. **Skeleton** — WXT init, React 19, Tailwind v4, Biome, pnpm, basic popup that says "hello".
2. **Crypto core** — `crypto/kdf.ts`, `crypto/aead.ts`, `crypto/envelope.ts` + tests. No UI yet.
3. **Storage layer** — typed `chrome.storage.local` client, vault read/write, atomic-write helpers, migration scaffolding + tests.
4. **Messaging** — service worker holds the key; popup sends messages.
5. **Onboarding** — first-run flow with zxcvbn-ts.
6. **Unlock screen** + auto-lock timer.
7. **Vault list + add form** (no notes/tags/kind/expires yet) — copy + reveal + delete.
8. **Edit + extended fields** (notes, tags, kind, expiresAt).
9. **Search.**
10. **Options page** — auto-lock duration, theme/accent, change master password, reset vault.
11. **Backup** — encrypted export + import; plaintext export.
12. **CI** — `ci.yml` and `release.yml`.
13. **Polish** — empty states, toasts, accessibility pass, expiry warnings.
14. **Submission prep** — `PRIVACY.md`, `STORE_LISTING.md`, screenshots, icons, manual QA in fresh profile.
15. **Submit.**
