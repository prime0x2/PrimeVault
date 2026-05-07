# PrimeVault

> Encrypted Chrome extension vault for API keys & tokens. Zero-knowledge, open source, lives in your toolbar.

[![CI](https://github.com/prime0x2/PrimeVault/actions/workflows/ci.yml/badge.svg)](https://github.com/prime0x2/PrimeVault/actions/workflows/ci.yml)

PrimeVault is a small, auditable Chrome extension for developers who routinely paste API keys, tokens, and secrets between terminals, browsers, and dashboards. Click the toolbar icon, unlock with your master password, copy what you need, get back to work.

- **Zero-knowledge:** the master password never leaves your device. The vault is encrypted client-side with AES-256-GCM under a PBKDF2-derived key.
- **No accounts, no servers:** zero network requests. Audit the source.
- **Local-only:** the encrypted vault lives in `chrome.storage.local`. Nothing is synced.
- **Auto-lock + clipboard auto-clear:** configurable idle timer wipes the in-memory key; configurable clipboard timer overwrites copied secrets.
- **Encrypted backup:** export your vault to a file, restore on a new machine.
- **Open source, MIT-licensed.**

Full design and threat model: [`specs/2026-05-04_spec.md`](./specs/2026-05-04_spec.md). Privacy policy: [`PRIVACY.md`](./PRIVACY.md). Store listing copy: [`STORE_LISTING.md`](./STORE_LISTING.md).

## Status

**v1.0.0 — pre-submission.** Phases 1–13 complete (skeleton, crypto, storage, messaging, onboarding, unlock, vault list, edit, search, options, backup, CI, polish). Phase 14 is submission prep; Phase 15 is the actual store submission. See [`specs/2026-05-04_spec.md`](./specs/2026-05-04_spec.md) §18 for the build plan.

275 unit tests passing. CI runs typecheck, lint, test, and build on every PR.

## Stack

- [WXT](https://wxt.dev) (extension framework) + React 19 + TypeScript 5
- Tailwind CSS v4 + custom token-driven primitives in `src/components/{terminal,form}.tsx`
- Two-direction theme: Direction B (Terminal — phosphor green on warm-black) for dark, Direction C (Calm — ember orange on near-white) for light. System preference is the default.
- WebCrypto (PBKDF2-SHA256, AES-256-GCM)
- `zxcvbn-ts` for password strength scoring (lazy-loaded; not in the steady-state popup bundle)
- Vitest for unit tests, Biome for lint+format, pnpm for installs
- GitHub Actions for CI

## Develop

```sh
pnpm install
pnpm dev          # Chrome with HMR (auto-launches a persistent dev profile)
pnpm dev:firefox  # Firefox with HMR
```

The first `pnpm dev` creates a persistent profile under `.wxt/chrome-data/` so the unlocked vault, settings, and onboarding state survive between runs. Delete that directory to test the first-run flow on a fresh state.

If `pnpm dev` ever fails with `ENOENT: no such file or directory, open '.wxt/chrome-data/chrome-out.log'`, it means the profile dir got cleaned (e.g. `wxt clean` or fresh checkout). The `dev` script auto-creates it, so just rerun.

### Keyboard shortcut

Default: `⌘⇧K` (Mac) / `Ctrl+Shift+K` (Win/Linux). Bound on first install. If Chrome ever drops the binding (it can after manifest changes in dev), rebind at `chrome://extensions/shortcuts` under the row labelled **"Activate the extension."**

## Build / package

```sh
pnpm build        # production build → .output/chrome-mv3/
pnpm zip          # zipped artifact ready for the Chrome Web Store
```

## Quality

```sh
pnpm compile      # tsc --noEmit (typecheck)
pnpm lint         # Biome check (lint + format + import order)
pnpm lint:fix     # auto-fix
pnpm test         # vitest run
pnpm test:watch   # watch mode
pnpm test:coverage
```

CI runs these four (compile, lint, test, build) on every PR.

## Manual QA — fresh-profile checklist

Before any release, exercise the full flow against a production build in a fresh Chrome profile. The dev profile accumulates state that can mask "I assumed prior state" bugs.

1. `pnpm build`
2. New Chrome profile or `rm -rf .wxt/chrome-data` then `pnpm dev`
3. Onboard: create vault with a strong master password
4. Add an entry with notes, tags, and an expiry date
5. Reveal, copy, edit, delete that entry
6. Search by name and by tag
7. Lock manually; unlock; try with the wrong password
8. Wait for auto-lock to fire
9. Copy a value; close the popup; verify the clipboard auto-clears at the configured timeout
10. Settings: change theme, change auto-lock duration, change clipboard-clear duration
11. Settings: change master password; lock; unlock with the new password
12. Settings: encrypted export → reset vault → encrypted import → entries restored
13. Settings: plaintext export (acknowledge the warning)
14. Settings: reset vault; verify popup returns to onboarding

If any step deviates from expected behavior, that's a release blocker.

## Repository layout

See [`specs/2026-05-04_spec.md`](./specs/2026-05-04_spec.md) §14 for the full layout. Briefly:

```
src/
  entrypoints/      # popup, options, background SW, offscreen doc
  features/         # unlock, vault, options, backup, passwords
  components/       # terminal.tsx (popup atoms), form.tsx (options primitives)
  crypto/           # PBKDF2 + AES-GCM + envelope
  storage/          # client + vault + prefs + migrations + schema
  messaging/        # protocol + client + server + session + clipboard
  styles/           # theme.css — CSS-var palette + direction switch
  lib/              # ulid, tags, theme, cn
tests/              # mirrors src/, vitest unit tests
.github/workflows/  # CI
```

## Contributing

Issues and PRs welcome. Before submitting:

1. Run `pnpm compile && pnpm lint && pnpm test` — these are what CI runs.
2. New features should land with tests. The repo has 240+ tests as a baseline; please don't shrink that.
3. UI changes should preserve accessibility (every interactive element keyboard-reachable and labeled).
4. Crypto changes need extra care. Read [`specs/2026-05-04_spec.md`](./specs/2026-05-04_spec.md) §3 (threat model) and §4 (cryptographic design) first; flag the change in the PR description.

For substantive design changes, open an issue first to discuss before writing code.

## Privacy and security

PrimeVault makes no network requests, has no host permissions, and ships no third-party trackers. Your data never leaves your device. Full policy: [`PRIVACY.md`](./PRIVACY.md).

If you discover a security issue, please email **prime0x2@gmail.com** rather than opening a public issue.

## License

MIT — see [`LICENSE`](./LICENSE).
