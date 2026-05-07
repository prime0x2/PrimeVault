# PrimeVault — Chrome Web Store screenshots

Two-stage pipeline:

1. **`pnpm capture-shots`** — drives the built popup through 5 scenes via the
   same `launchPersistentContext` + `--load-extension` harness as
   `e2e/fixtures.ts`, captures each at native size, writes to `raw/`.
2. **`pnpm frame-shots`** — composites each raw PNG onto a 1280×800 brand
   frame (Direction-B vocabulary, matches `docs/brand/social-dark.png`),
   writes to this directory. Those are the upload-ready files.

Run prerequisite for `capture-shots`: `pnpm build` — the script reads
`.output/chrome-mv3/`.

## What lives here

| File | Size | Scene |
|---|---|---|
| `01-onboarding.png` | 1280×800 | "One master key. No recovery." — strength meter at very strong |
| `02-vault-list.png` | 1280×800 | "All your secrets, one toolbar away." — every kind, expiry-aware |
| `03-add-entry.png`  | 1280×800 | "Stash a secret in seconds." — every form field exercised |
| `04-unlock.png`     | 1280×800 | "No accounts. No servers." — local-only / zero-knowledge |
| `05-options.png`    | 1280×800 | "Auto-lock. Auto-clear." — both timers tunable |
| `raw/*.png`         | native   | Source popup PNGs (380×560 / 720×900) before framing |

The popup CSS is `width: 380px; height: 560px;` (see
`src/entrypoints/popup/style.css`). Options is a full-page tab — captured at
720×900 (`max-w-2xl` + page padding).

## Uploading to the Chrome Web Store

The CWS dashboard accepts screenshots at **1280×800** or **640×400** — the
framed shots above are the right size for the larger gallery. Upload point:

  https://chrome.google.com/webstore/devconsole → Store listing → Screenshots

Suggested upload order matches the file numbering: vault list (02) is the
strongest single shot, but onboarding (01) sets the privacy story first.

## Regenerating

```sh
pnpm build          # rebuild extension if you've changed UI code
pnpm capture-shots  # → docs/screenshots/raw/*.png
pnpm frame-shots    # → docs/screenshots/*.png (uses the raws above)
```

Both scripts are deterministic up to font hinting / date math (the
"expires in N days" entries are computed from `Date.now()` so the
visible dates change across runs). Each capture scene uses a fresh
Chromium profile, so no state leaks between scenes.

## Sample data

The vault-list scene seeds five entries — one of each `ENTRY_KIND` — with
mixed scopes and varied expiry. Insertion order is reverse-chronological in
the UI, so the entries land top-down as: AWS root (expired), GitHub PAT
(expires 7d), Stripe live key, WiFi password, Recovery phrase. Two badges in
the top half, all five kinds, both scopes — that's the storytelling target.

The values themselves are bogus but the *shapes* (`sk_live_…`, `ghp_…`,
`AKIA…`) read as authentic.
