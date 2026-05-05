# Security policy

## Reporting a vulnerability

If you discover a security issue in PrimeVault, please **email
prime0x2@gmail.com** with the details. Do not open a public GitHub issue
for security reports — that surfaces the vulnerability to anyone watching
the repo before there's a fix.

When reporting, include:

- A clear description of the issue and the impact you're concerned about.
- Steps to reproduce (or, ideally, a proof-of-concept).
- Affected version(s) — usually the tagged release or commit SHA.
- Whether the issue affects only development builds, only production
  builds (the Chrome Web Store ZIP), or both.

We will:

- Acknowledge your report within **3 business days**.
- Provide an initial assessment within **7 business days**.
- Keep you informed as we work through reproduction, fix, and release.

PrimeVault is a small open-source project; we don't run a bug bounty.
We will credit reporters in the changelog and release notes when a fix
ships, unless you request otherwise.

## Scope

In scope:

- Cryptographic flaws in the vault encryption, key derivation, or backup
  formats (`src/crypto/`, `src/features/backup/format.ts`).
- Privilege escalation, sandbox escapes, or remote code execution that the
  extension makes possible.
- Logic flaws that allow accessing or modifying the vault without the
  master password.
- Credential leakage to logs, the network, or other extensions.
- Supply-chain risks introduced by our build pipeline.

Out of scope:

- Threats from a fully compromised local machine. The threat model in
  [`specs/2026-05-04_spec.md`](./specs/2026-05-04_spec.md) §3 documents
  this explicitly: PrimeVault cannot defend against malware running with
  the user's privileges.
- Third-party Chrome browser bugs (please report those upstream).
- Issues that require physical access to an unlocked Chrome session.
- Self-XSS or social-engineering reproductions.

## Cryptographic design

The encryption design and threat model live in
[`specs/2026-05-04_spec.md`](./specs/2026-05-04_spec.md) §3 and §4. If
your report is about a specific design choice, citing the relevant section
makes review faster.

## Disclosure

We follow a coordinated-disclosure model: please give us a reasonable
window (typically 90 days) to ship a fix before publishing details.
We aim to release fixes faster than that and will signal when a fix is
shipped via the GitHub Releases page and `CHANGELOG.md`.
