# Contributing to PrimeVault

Thanks for your interest. PrimeVault is a small, opinionated codebase —
contributions that align with the spec are welcome; substantive design
changes should start with an issue.

## Before you write code

1. **Read the spec.** [`specs/2026-05-04_spec.md`](./specs/2026-05-04_spec.md)
   is the source of truth for design intent. Most non-trivial PRs reference
   a section number.
2. **Open an issue first** for design-affecting changes (new permissions,
   new storage keys, new wire-protocol messages, anything cryptographic).
   This avoids writing code we end up rejecting.
3. **Search existing issues and PRs** to make sure someone hasn't already
   started on the same thing.

## Local setup

```sh
pnpm install
pnpm dev          # Chrome with HMR
```

The first `pnpm dev` creates a persistent Chrome profile under
`.wxt/chrome-data/`. Delete that directory to test the first-run flow.

## The four gates

Before opening a PR, all four must be green locally — they're what CI runs:

```sh
pnpm compile      # tsc --noEmit
pnpm lint         # biome check
pnpm test         # vitest run
pnpm build        # production build
```

`pnpm lint:fix` will auto-fix most formatting and import-order issues.

## Pull request conventions

- **Branch from `main`.** Keep your branch focused on one logical change.
- **Tests are not optional** for new features or bug fixes. Mirror the
  `src/` structure in `tests/`. The repo has 250+ unit tests as a
  baseline; please don't shrink that.
- **Reference the spec** in the PR description if your change touches a
  specced area: e.g. "implements §10.7 search debouncing."
- **Crypto changes need extra care.** Read §3 (threat model) and §4
  (cryptographic design) first. Flag any change to `src/crypto/`,
  `src/storage/`, or the message protocol prominently in the PR.
- **No new dependencies without justification.** PrimeVault ships in a
  Chrome Web Store ZIP; every kilobyte counts. Prefer the standard
  library or existing utilities.
- **Accessibility is non-negotiable.** Every interactive element must be
  keyboard-reachable and labeled. The existing code uses 30+ aria
  attributes; new components should match that bar.
- **Follow the commit-message style** of recent commits on `main`. One-line
  summary, blank line, paragraphs of context. Imperative voice. Co-author
  trailer if pairing or AI-assisted.

## Code style

- TypeScript strict mode. No `any`, no `@ts-ignore`. Cast comments
  required for any `as Foo` that's load-bearing.
- Discriminated unions for state machines (no boolean soup).
- `useId` for form labels, never hand-rolled IDs.
- Comments are *why*, not *what*. Well-named identifiers handle the *what*.
- No barrel files. Direct imports keep tree-shaking honest.

## What gets rejected

- Mocking the database or storage in integration tests. Use
  `createMemoryBackend` — it mimics `chrome.storage.local`'s
  structured-clone semantics and is fast.
- New permissions in the manifest without a written justification in
  `STORE_LISTING.md`.
- Network requests, telemetry, or analytics. PrimeVault is offline-only.
- Console logging in production code paths.

## Releasing

Maintainers cut releases. Tag a `v*` push to trigger `release.yml`, which
builds, zips, and creates a GitHub Release with the artifact attached.
See `TODO_MANUAL.md` (private to the maintainer) for the Chrome Web Store
submission ceremony.

## Questions

Open a [discussion](https://github.com/prime0x2/PrimeVault/discussions)
for general questions, or an issue for specific bugs and feature
requests. Security issues — see [`SECURITY.md`](./SECURITY.md).
