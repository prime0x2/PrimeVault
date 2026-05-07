# Changelog

All notable changes to PrimeVault are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- _Things added since the last release._

### Changed

- _Changes to existing behavior._

### Fixed

- _Bug fixes._

### Security

- _Security-relevant changes. Always call these out explicitly._

---

## [1.0.0] — TBD

Initial public release.

### Added

- Zero-knowledge encrypted vault for API keys and tokens
- Master password unlock with PBKDF2-SHA256 (600,000 iterations) + AES-256-GCM
- Vault list with copy, edit, delete (SPEC §10)
- Search by name (substring) and tags (exact), debounced 80ms
- Filter chips for entry kind (sorted by count, with overflow folding) and expiry urgency (`expired` / `soon`)
- Extended fields: notes, tags (capped at 10), kind (`secret` / `api_key` / `token` / `password` / `other`), optional `scope` (personal / work), expiry date with urgency badges
- Auto-lock with configurable idle timeout (Never / 1 / 2 / 5 / 15 / 60 min)
- Clipboard auto-clear via offscreen document (Never / 30 / 60 s — 15s removed because Chrome alarms floor below 30s)
- Settings page: theme (system / light / dark), auto-lock, clipboard timer, change master password, reset vault
- Two-direction theme system: Direction B (Terminal, phosphor green) for dark, Direction C (Calm, ember orange) for light
- Encrypted backup export and import; gated plaintext export
- Keyboard shortcut: `⌘⇧K` (Mac) / `Ctrl+Shift+K` (Win/Linux)

### Security

- Manifest V3 with minimal permissions (`storage`, `alarms`, `offscreen`, `clipboardWrite`); no host permissions
- Strict CSP: `script-src 'self'; object-src 'self'; connect-src 'self'`
- Atomic write-and-swap on every vault save (crash-safe)
- Decrypt-to-verify password check (no separate password hash stored)
- Forward-only schema migrations
- Zero network requests; zero third-party SDKs

[Unreleased]: https://github.com/prime0x2/PrimeVault/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/prime0x2/PrimeVault/releases/tag/v1.0.0
