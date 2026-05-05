# Senior Review — Action Plan

> **Source:** [`review/2026-05-05_15-12_senior-engineering-review.md`](../review/2026-05-05_15-12_senior-engineering-review.md)
> **Created:** 2026-05-05
> **Status:** in progress
>
> Every actionable item the reviewer raised — Quibbles, Real Issues, Hard-Truth review prep, and the v0.2+ Nice-to-haves — extracted verbatim and organized in execution order. Nothing is dropped; some items are explicitly deferred with a reason.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[—]` consciously deferred

---

## P0 — Pre-submission blockers (do before v0.1.0)

These are the items the reviewer flagged as "fix before clicking submit." Plus the Hard-Truth section's listing-copy tightening, which is also pre-submission because it's what Chrome reviewers read.

- [x] **P0.1** Fix the "clipboard auto-clear" banner / Settings copy so it doesn't lie about a 15s clear that Chrome floors to 30s.
  - Reviewer's note: `EntryRow.tsx:237` banner says "clears in 15s" but `chrome.alarms` minimum in production is 30s.
  - Decision: option (b) from review — keep the banner honest by adding a Settings copy note ("Chrome minimum is 30 seconds; shorter values are clamped") AND clamp the banner to `Math.max(seconds, 30)` so the displayed countdown matches reality. Belt + suspenders.
- [x] **P0.2** Triage the open Dependabot alert.
  - GHSA-w5hq-g745-h8pq (uuid <14, missing buffer bounds check in v3/v5/v6). Devdep-only chain `wxt > web-ext-run > node-notifier > uuid@8.3.2`; node-notifier calls `v4()` without a buffer so the CVE's preconditions never hold. Documented in `TODO_MANUAL.md`.
- [x] **P0.3** Tighten `clipboardWrite` permission justification in `STORE_LISTING.md`.
- [x] **P0.4** Surface the `offscreen` justification cleanly in `STORE_LISTING.md`.

---

## P1 — Quick hygiene wins (low effort, high signal)

Small, isolated changes. Bundling them into one or two commits is fine.

- [x] **P1.1** Add `SECURITY.md` with the disclosure policy. GitHub surfaces this in the Security tab. (Review §7, also nice-to-have #7.)
- [x] **P1.2** Add `CONTRIBUTING.md` with PR conventions, test gate, and "open issue first for design changes." (Review §7.)
- [x] **P1.3** Add `.github/ISSUE_TEMPLATE/bug.md` (and feature-request template) plus `.github/PULL_REQUEST_TEMPLATE.md`. (Review §11.)
- [x] **P1.4** Add a one-line *why* comment on `Vault.tsx:65`'s `lock()` finally-block: "fail-safe to lock — if the SW lock message itself errors, we still want the popup to show locked state."
- [x] **P1.5** Add a one-line *why* comment on `clearVault` (storage/vault.ts) explaining why `pv:meta` is intentionally preserved. (Review §2.)
- [x] **P1.6** Pick a single style for empty catch blocks (`.catch(() => undefined)` vs `.catch(() => {})`) and apply consistently. (Review §10.)
- [x] **P1.7** Strengthen the warning on `deriveBytes` in `kdf.ts` (or rename to `__deriveBytesForTesting`) so production code can't reach for it. (Review §1.)
- [x] **P1.8** Add comments explaining the `as BufferSource` casts in `kdf.ts` and `aead.ts` (TS+lib.dom DOM-vs-Worker mismatch). (Review §1.)
- [x] **P1.9** Wrap `backend.set` in `storage/vault.ts` with a try/catch that surfaces `QUOTA_BYTES_PER_ITEM` cleanly so a 50MB cert paste fails loudly instead of silently. (Review §2.)
- [x] **P1.10** Extract duplicated OKLCH theme tokens into `src/styles/theme.css` shared by `popup/style.css` and `options/style.css`. (Review §10, also nice-to-have #4.)

---

## P2 — Test improvements

Reviewer flagged the coverage config as "measuring 1/4 of the codebase" and the lack of UI tests as "the single biggest test-suite improvement available."

- [x] **P2.1** Expand `vitest.config.ts` coverage `include` to cover all of `src/` (excludes wiring entrypoints + shadcn primitives). Honest numbers now: 49% statements / 30% branches.
- [x] **P2.2** Add a regression test that mutates the envelope's `version` field and asserts decrypt fails — locks in the AAD binding. (Review §1.)
- [x] **P2.3** Wire up `@testing-library/react` + `happy-dom`. First batch of UI tests covers `EntryForm` (validation, submit, duplicate-name error) and `SearchBar` (status chip, clear button, Escape key). More forms can land later under the same harness.
- [—] **P2.4** Property tests with `fast-check` for `entryMatches` / `normalizeTags`. *Deferred to v0.2.* (Review §5.)
- [—] **P2.5** Real-Chrome offscreen-clipboard integration test. *Deferred to v0.2 — needs Playwright pipeline.* (Review §5.)

---

## P3 — TypeScript strictness

The reviewer called `noUncheckedIndexedAccess` "the single biggest win you can get in TS strictness."

- [ ] **P3.1** Enable `noUncheckedIndexedAccess` in `tsconfig.json` and fix the resulting narrowings (e.g. `session.ts:358` `as Entry` after `findIndex`). (Review §6, nice-to-have #1.)
- [ ] **P3.2** Enable `exactOptionalPropertyTypes` and fix fallout. Lower priority than P3.1. (Review §6.)
- [ ] **P3.3** Audit React hooks rules — Biome's `useExhaustiveDependencies` is `'warn'`; do a one-pass pass and either escalate to `'error'` or document the exceptions. (Review §6.)

---

## P4 — Code organization (refactors)

These are the structural items. Bigger but isolated; do them after P0–P3 so the diffs stay reviewable.

- [ ] **P4.1** Split `src/messaging/session.ts` (666 LOC) into:
  - `session.ts` — core lifecycle (status / setup / unlock / lock / changePassword / resetVault)
  - `session-entries.ts` — CRUD (get / add / update / delete / markUsed)
  - `session-backup.ts` — export / import
  (Review §3, §11, nice-to-have #6.)
- [ ] **P4.2** Split `EntryRow.tsx` (278 LOC):
  - Extract `<RowActions>` for the icon-button cluster
  - Extract `useCopy` hook for copy / banner / clipboard side-effects
  (Review §4.)
- [ ] **P4.3** Unify `usePrefs` (options) and `usePopupPrefs` (popup) into one hook with a `subscribe: boolean` flag. (Review §4.)
- [ ] **P4.4** Tighten the `as never` cast in `src/messaging/client.ts:43` using mapped-type tricks so `client.send` doesn't fall back to `unknown`/`never`. (Review §3, §10.)

---

## P5 — Performance polish

Not measurable on small vaults, but cheap to fix.

- [ ] **P5.1** `useMemo` the sorted entries array in `EntryList.tsx:29` so we don't `.sort()` on every render. (Review §9.)
- [ ] **P5.2** Audit zxcvbn lang-pack chunk sizes (1.2MB + 465KB). Decide if `@zxcvbn-ts/language-common` plus `@zxcvbn-ts/language-en` are both pulling weight, or if one can be trimmed. (Review §9.)
- [ ] **P5.3** Throttle / batch `lastUsedAt` + `copyCount` writes so 1000 rapid copies don't trigger 1000 disk writes. Reasonable batching window: 1–2s debounce. (Review §8.)
- [—] **P5.4** Optimize `storage.onChanged` listener so a theme change doesn't re-validate prefs end-to-end. *Deferred — measured cost is negligible.* (Review §9.)

---

## P6 — Documentation gaps

- [ ] **P6.1** Add `docs/architecture.md` with a Mermaid diagram of popup ↔ SW ↔ offscreen ↔ storage. (Review §7, nice-to-have #5.)
- [ ] **P6.2** Update SPEC §3 (threat model) to explicitly note: "Chrome SW eviction = surprise auto-lock from user's POV" — fail-safe but worth documenting. (Review §8.)
- [ ] **P6.3** Update SPEC §9 to call out that the strength-meter check is client-side only and the threat model accepts that. (Review §8.)

---

## P7 — Defense-in-depth security

The reviewer was clear these are v0.2 territory, not pre-submission. Listed for completeness.

- [—] **P7.1** Lockout after N failed unlock attempts with exponential backoff. *Deferred to v0.2.* (Review §8, nice-to-have #8.)
- [—] **P7.2** Add re-confirm / rate-limit step on plaintext export so a single checkbox doesn't enable repeated exports. *Deferred to v0.2 — current gating is acceptable.* (Review §8.)

---

## P8 — CI / tooling

- [ ] **P8.1** Add a bundle-size budget step in `ci.yml` that fails if popup or background bundles grow more than X% over a baseline. (Review §6, nice-to-have #9.)
- [ ] **P8.2** Move the `.wxt/chrome-data` mkdir to `postinstall` (in addition to `dev`) so first-time clones don't see the ENOENT. (Review §6.)

---

## P9 — Larger v0.2+ items

These are the heaviest items. None are pre-submission; all are listed so they don't get lost.

- [—] **P9.1** Playwright E2E smoke test for onboard → add → copy → lock against the production build, wired into CI. (Review §5, nice-to-have #10.)
- [—] **P9.2** Add `requestId: nanoid()` to the wire envelope for correlation logging when debugging production issues. (Review §3.)
- [—] **P9.3** When the first real schema migration is added, also add a fixture-based test that loads the older envelope through the new code path. *Deferred until needed.* (Review §2.)
- [—] **P9.4** Optimistic UI updates for CRUD ops so we don't always wait for the SW round-trip. *Deferred — round-trips are 5–15ms.* (Review §4.)
- [—] **P9.5** Virtualization for vault list past ~500 entries. *Deferred — current scale is <100.* (Review §4.)

---

## Execution plan

1. **P0** — required for v0.1.0 submission. Do these first.
2. **P1** — knock out in one sitting; mostly comments and small files.
3. **P2.1 + P2.2** — coverage expansion + AAD test (pure additions, no risk).
4. **P3.1** — `noUncheckedIndexedAccess`. Fixes will surface narrowing bugs we want flushed before refactors.
5. **P4** — refactors, in order: client.ts cast → usePrefs unify → EntryRow split → session.ts split. (Smallest blast radius first.)
6. **P5** — perf polish.
7. **P6** — docs.
8. **P8** — CI niceties.
9. **P2.3** — UI tests can land any time after P3.1; doing them last so the refactored shapes are stable.
10. **P3.2 / P3.3** — strictness round 2, after the dust settles.
11. **P7 / P9** — explicitly deferred to a v0.2 sprint plan.

When P0–P6 are done we cut **v0.1.0** and submit. P7+ become the v0.2 backlog.
