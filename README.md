# PrimeVault

> Encrypted vault for API keys & tokens. Zero-knowledge, open source, lives in your toolbar.

A Chrome extension built with WXT + React 19 + Tailwind v4. See [`SPEC.md`](./SPEC.md) for the full design and threat model.

## Status

Phase 1 — scaffold. Empty popup that says "PrimeVault". Crypto, vault, and UI come in subsequent phases (see SPEC §18).

## Develop

```sh
pnpm install
pnpm dev          # Chrome with HMR
pnpm dev:firefox  # Firefox with HMR
```

The dev command launches a fresh browser profile with the extension loaded. Hot-reload works for the popup.

## Build / package

```sh
pnpm build        # production build → .output/chrome-mv3/
pnpm zip          # zipped artifact ready for the Chrome Web Store
```

## Quality

```sh
pnpm lint         # Biome check (lint + format + import order)
pnpm lint:fix     # auto-fix
pnpm compile      # tsc --noEmit
```

## License

MIT — see [`LICENSE`](./LICENSE).
