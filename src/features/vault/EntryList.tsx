import { useMemo, useState } from 'react';
import {
  DangerButton,
  DialMarkLarge,
  GhostButton,
} from '../../components/terminal';
import { popupClient } from '../../messaging/popup-client';
import type { ClipboardClearSeconds } from '../../storage/prefs';
import type { Entry } from '../../storage/schema';
import { EntryRow } from './EntryRow';

interface EntryListProps {
  entries: Entry[];
  onMutated: () => void;
  /** True when an active search filter has reduced the list to zero rows. */
  filtered?: boolean;
  /** Active query — shown in the no-matches state for context. */
  query?: string;
  /** Triggered by the no-matches state's "+ new entry" button. */
  onAddEntry?: (() => void) | undefined;
  /** Bubble up edit requests so Vault can render the form full-screen. */
  onRequestEdit: (entry: Entry) => void;
  /** Triggered by the no-matches state's "Clear" button. */
  onClearSearch?: (() => void) | undefined;
  /** From prefs; passed through to each row for the post-copy timer. */
  clipboardClearSeconds: ClipboardClearSeconds;
}

export function EntryList({
  entries,
  onMutated,
  filtered = false,
  query = '',
  onAddEntry,
  onRequestEdit,
  onClearSearch,
  clipboardClearSeconds,
}: EntryListProps): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Default sort per SPEC §10.8: lastUsedAt desc → updatedAt desc → name asc.
  // Memoized — rerunning the sort every render shows up under React profiler
  // even at modest entry counts because we set transient UI state frequently.
  const sorted = useMemo(
    () =>
      entries.slice().sort((a, b) => {
        const lu = (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '');
        if (lu !== 0) return lu;
        const up = b.updatedAt.localeCompare(a.updatedAt);
        if (up !== 0) return up;
        return a.name.localeCompare(b.name);
      }),
    [entries],
  );

  if (entries.length === 0) {
    return filtered ? (
      <NoMatchesState
        query={query}
        onAddEntry={onAddEntry}
        onClearSearch={onClearSearch}
      />
    ) : (
      <EmptyState onAddEntry={onAddEntry} />
    );
  }

  async function confirmDelete(): Promise<void> {
    if (!confirmingDelete || deleting) return;
    setDeleting(true);
    try {
      await popupClient.send({
        kind: 'deleteEntry',
        id: confirmingDelete.id,
      });
      setConfirmingDelete(null);
      if (expandedId === confirmingDelete.id) setExpandedId(null);
      onMutated();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      <ul className="flex-1 overflow-y-auto px-2">
        {sorted.map((entry, i) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            selected={i === 0 && expandedId === null}
            expanded={expandedId === entry.id}
            onToggleExpand={() =>
              setExpandedId((id) => (id === entry.id ? null : entry.id))
            }
            onRequestEdit={() => onRequestEdit(entry)}
            onRequestDelete={() => setConfirmingDelete(entry)}
            onCopied={onMutated}
            clipboardClearSeconds={clipboardClearSeconds}
          />
        ))}
      </ul>

      {confirmingDelete && (
        <DeleteConfirmModal
          entryName={confirmingDelete.name}
          deleting={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}

// ───── Empty / no-matches states (terminal aesthetic) ─────────────────────

function EmptyState({
  onAddEntry,
}: {
  onAddEntry?: (() => void) | undefined;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
      <DialMarkLarge size={92} />
      <h2 className="mt-5 mb-1.5 font-semibold text-[18px] tracking-[-0.015em]">
        Vault is empty.
      </h2>
      <p className="m-0 max-w-[240px] text-[12.5px] text-text-dim leading-[1.55]">
        Stash your first secret with the button below — or paste any value to
        auto-detect type.
      </p>
      {onAddEntry && (
        <button
          type="button"
          onClick={onAddEntry}
          className="mt-[22px] inline-flex items-center gap-2 rounded-[10px] border border-dashed border-border-strong px-[18px] py-2.5 font-mono text-[12px] text-text hover:bg-bg-elev"
        >
          <span style={{ color: 'var(--accent)' }}>+</span> new secret
        </button>
      )}
    </div>
  );
}

function NoMatchesState({
  query,
  onAddEntry,
  onClearSearch,
}: {
  query: string;
  onAddEntry?: (() => void) | undefined;
  onClearSearch?: (() => void) | undefined;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-7 text-center">
      <div className="mb-4.5 flex h-[60px] w-[60px] items-center justify-center rounded-2xl border border-border-default bg-bg-elev">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle
            cx="10"
            cy="10"
            r="6.5"
            stroke="var(--text-dim)"
            strokeWidth="1.5"
          />
          <path
            d="M15 15l5 5"
            stroke="var(--text-dim)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="mb-2.5 font-mono text-[11px] text-text-muted">
        <span style={{ color: 'var(--accent)' }}>›</span> grep returned 0
        matches
      </p>
      <h2 className="mb-1.5 font-semibold text-[18px] leading-[1.25] tracking-[-0.015em]">
        No entry matches
        <br />
        <span className="font-mono" style={{ color: 'var(--accent)' }}>
          "{query}"
        </span>
      </h2>
      <p className="m-0 max-w-[240px] text-[12.5px] text-text-dim leading-[1.55]">
        Try fewer characters, search by tag, or stash it as a new secret.
      </p>
      <div className="mt-5 flex gap-2">
        {onClearSearch && (
          <GhostButton onClick={onClearSearch}>Clear</GhostButton>
        )}
        {onAddEntry && (
          <button
            type="button"
            onClick={onAddEntry}
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-accent px-3.5 font-sans font-semibold text-[12.5px] text-bg shadow-[0_4px_16px_-8px_var(--accent)] hover:brightness-110"
          >
            + new entry
          </button>
        )}
      </div>
    </div>
  );
}

// ───── Delete confirm — centered modal with `rm --force` line ────────────

function DeleteConfirmModal({
  entryName,
  deleting,
  onConfirm,
  onCancel,
}: {
  entryName: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      className="absolute inset-0 z-10 overflow-hidden"
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(8,7,11,0.7)',
          backdropFilter: 'blur(2px)',
        }}
      />
      <div
        className="-translate-y-1/2 absolute top-1/2 right-4 left-4 rounded-xl border bg-bg-elev p-5 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.7)]"
        style={{ borderColor: 'var(--border-strong)' }}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-[8px] border"
            style={{
              background: 'var(--danger-soft)',
              borderColor: 'var(--danger-border)',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 5v4M8 11v.5"
                stroke="var(--danger)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <path
                d="M8 1.5L14.5 13H1.5L8 1.5Z"
                stroke="var(--danger)"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            className="font-mono text-[11px] tracking-[0.1em]"
            style={{ color: 'var(--danger)' }}
          >
            DELETE ENTRY
          </div>
        </div>

        <h2
          id="delete-title"
          className="mb-1.5 font-semibold text-[18px] leading-[1.25] tracking-[-0.015em]"
        >
          Delete{' '}
          <span className="font-mono" style={{ color: 'var(--accent)' }}>
            {entryName}
          </span>
          ?
        </h2>
        <p className="mb-4 text-[12.5px] text-text-dim leading-[1.55]">
          This entry will be wiped from the vault. There is no undo and no
          recovery.
        </p>

        <div
          className="mb-4 rounded-[8px] border bg-bg-sunken px-2.5 py-2 font-mono text-[11px] text-text-dim"
          style={{ borderColor: 'var(--border)' }}
        >
          <span style={{ color: 'var(--accent)' }}>›</span> rm {entryName}{' '}
          <span style={{ color: 'var(--text-muted)' }}>--force</span>
        </div>

        <div className="flex gap-2">
          <GhostButton
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 h-10 rounded-[8px]"
          >
            Cancel
          </GhostButton>
          <DangerButton
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 h-10 rounded-[8px]"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </DangerButton>
        </div>
      </div>
    </div>
  );
}
