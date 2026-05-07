# PrimeVault — Architecture

A one-page map of how the pieces fit together. For full design rationale see
[`specs/2026-05-04_spec.md`](../specs/2026-05-04_spec.md); this doc is the
shape, not the why.

## Component diagram

```mermaid
flowchart LR
  subgraph User["User's Chrome window"]
    Popup["Popup<br/>(React + Tailwind)"]
    Options["Options page<br/>(full-tab React)"]
  end

  subgraph SW["Background service worker"]
    Background["entrypoints/background.ts"]
    Session["messaging/session.ts<br/>session-core / -entries / -backup"]
    Clipboard["messaging/clipboard.ts"]
  end

  Offscreen["Offscreen document<br/>(transient — clipboard write only)"]

  subgraph Disk["chrome.storage.local"]
    Envelope[("pv:envelope<br/>+ pv:envelope.next")]
    Prefs[("pv:prefs")]
    Meta[("pv:meta<br/>(reserved)")]
  end

  Popup -- "browser.runtime.sendMessage" --> Background
  Options -- "browser.runtime.sendMessage" --> Background
  Background --> Session
  Background --> Clipboard

  Session -- "atomic write/read" --> Envelope
  Popup -. "direct read+subscribe" .-> Prefs
  Options -- "read+write+subscribe" --> Prefs

  Clipboard -- "chrome.alarms.create" --> SW
  SW -- "alarm fires" --> Clipboard
  Clipboard -- "chrome.offscreen.createDocument" --> Offscreen
  Offscreen -. "navigator.clipboard.writeText('')" .-> Disk
  Offscreen -- "close after write" --> Clipboard
```

## Trust boundaries

```mermaid
flowchart TB
  classDef trusted fill:#eef,stroke:#33a
  classDef sensitive fill:#fee,stroke:#a33

  Popup["Popup (untrusted by SW —<br/>messages re-validated with Zod)"]:::trusted
  SW["Service worker<br/>(holds derived AES key in memory)"]:::sensitive
  Offscreen["Offscreen doc<br/>(no key, no plaintext —<br/>only writes empty clipboard)"]:::trusted
  Disk["chrome.storage.local<br/>(ciphertext only;<br/>plaintext never persists)"]:::sensitive

  Popup -->|message| SW
  SW -->|envelope| Disk
  SW -->|"clear()"| Offscreen
```

The master password and the derived AES-GCM key are visible only inside
the service worker process. Plaintext entries are decrypted on demand,
returned over the messaging protocol to the popup, and never persisted.

## Lifecycle of an unlock

```mermaid
sequenceDiagram
  participant U as User
  participant P as Popup
  participant SW as Service worker
  participant D as chrome.storage.local

  U->>P: open popup, type password
  P->>SW: { kind: 'unlock', password }
  SW->>D: read pv:envelope
  D-->>SW: envelope (kdf params, iv, ciphertext)
  SW->>SW: PBKDF2 (~600k iters, ~150ms)
  SW->>SW: AES-GCM decrypt + Zod-validate plaintext
  alt success
    SW-->>P: { state: 'unlocked', expiresAt }
    P-->>U: render vault
  else wrong password / tampered
    SW-->>P: MessagingError('wrongPassword')
    P-->>U: error toast (no detail leaked)
  end
```

## Lifecycle of a copy with auto-clear

```mermaid
sequenceDiagram
  participant U as User
  participant P as Popup
  participant SW as Service worker
  participant A as chrome.alarms
  participant O as Offscreen doc
  participant CB as Clipboard

  U->>P: click copy
  P->>CB: navigator.clipboard.writeText(value)
  P->>SW: { kind: 'scheduleClipboardClear', delayMs }
  SW->>A: clear+create alarm "pv:clearClipboard"
  Note over P: popup may close after this

  A->>SW: alarm fires (>= ~30s in production)
  SW->>O: chrome.offscreen.createDocument
  SW->>O: { target: 'offscreen', kind: 'clearClipboard' }
  O->>CB: navigator.clipboard.writeText('')
  O-->>SW: ok
  SW->>O: chrome.offscreen.closeDocument()
```

## Key files by layer

| Layer | Where | Notes |
|---|---|---|
| Crypto | `src/crypto/` | `kdf.ts` (PBKDF2), `aead.ts` (AES-GCM), `envelope.ts` (versioned wrapper, AAD-bound) |
| On-disk format | `src/storage/` | `vault.ts` (atomic write+swap), `prefs.ts`, `migrations.ts`, `prefs-hook.ts` (shared subscribe) |
| Wire protocol | `src/messaging/protocol.ts` | Zod schemas for every message, validated on both sides |
| Session | `src/messaging/session*.ts` | `session-core.ts` (key holder + helpers), `-entries.ts` (CRUD), `-backup.ts` (export/import), `session.ts` (lifecycle) |
| Messaging client | `src/messaging/client.ts` + `popup-client.ts` | Typed `send` |
| Clipboard auto-clear | `src/messaging/clipboard.ts` + `entrypoints/offscreen/main.ts` | DI'd over `chrome.alarms` + `chrome.offscreen` |
| UI | `src/features/{vault,unlock,options,backup,passwords}/` | React components grouped by feature |
| UI primitives | `src/components/terminal.tsx` (popup atoms) + `src/components/form.tsx` (options primitives + shared `<Alert>`) | Token-driven, no shadcn |
| Theme | `src/styles/theme.css` | OKLCH dark palette + RGB-hex light palette, swapped via `:root.dark` / `:root.light` / `prefers-color-scheme` |

## Where decisions are recorded

- **Threat model + crypto**: spec §3, §4. Includes what we *don't* defend against.
- **On-disk format**: spec §5–§6.
- **Wire protocol**: spec §7. JSDoc on `protocol.ts` mirrors it.
- **Auto-lock + clipboard timer**: spec §7.2, §10.4.
- **Tradeoffs from the senior review**: [`specs/2026-05-05_review-tasks.md`](../specs/2026-05-05_review-tasks.md).
