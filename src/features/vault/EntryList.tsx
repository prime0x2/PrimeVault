import { useMemo, useState } from 'react';
import type { ClipboardClearSeconds } from '../../storage/prefs';
import type { Entry } from '../../storage/schema';
import { EntryRow } from './EntryRow';

interface EntryListProps {
  entries: Entry[];
  onMutated: () => void;
  /** True when an active search filter has reduced the list to zero rows. */
  filtered?: boolean;
  /** From prefs; passed through to each row for the post-copy timer. */
  clipboardClearSeconds: ClipboardClearSeconds;
}

export function EntryList({
  entries,
  onMutated,
  filtered = false,
  clipboardClearSeconds,
}: EntryListProps): React.ReactElement {
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );

  // Default sort per SPEC §10.8: lastUsedAt desc → updatedAt desc → name asc.
  // Memoized — rerunning the sort every render shows up under React profiler
  // even at modest entry counts because we set transient UI state (revealed,
  // expanded, editing) frequently.
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
    return filtered ? <NoMatchesState /> : <EmptyState />;
  }

  function clearTransient(id: string) {
    setExpandedId((cur) => (cur === id ? null : cur));
    setRevealedId((cur) => (cur === id ? null : cur));
    setConfirmingDeleteId((cur) => (cur === id ? null : cur));
  }

  return (
    <ul className="flex-1 overflow-y-auto">
      {sorted.map((entry) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          revealed={revealedId === entry.id}
          expanded={expandedId === entry.id}
          editing={editingId === entry.id}
          confirmingDelete={confirmingDeleteId === entry.id}
          onReveal={() => setRevealedId(entry.id)}
          onMask={() => setRevealedId((id) => (id === entry.id ? null : id))}
          onToggleExpand={() =>
            setExpandedId((id) => (id === entry.id ? null : entry.id))
          }
          onRequestEdit={() => {
            setEditingId(entry.id);
            // Editing replaces the row UI; collapse other transient state.
            setExpandedId(null);
            setRevealedId(null);
            setConfirmingDeleteId(null);
          }}
          onCancelEdit={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            onMutated();
          }}
          onRequestDelete={() => setConfirmingDeleteId(entry.id)}
          onCancelDelete={() =>
            setConfirmingDeleteId((id) => (id === entry.id ? null : id))
          }
          onDeleted={() => {
            clearTransient(entry.id);
            if (editingId === entry.id) setEditingId(null);
            onMutated();
          }}
          onCopied={onMutated}
          clipboardClearSeconds={clipboardClearSeconds}
        />
      ))}
    </ul>
  );
}

function NoMatchesState(): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <div className="font-medium text-sm">No matches</div>
      <p className="text-muted-foreground text-xs">
        Nothing in your vault matches that search.
      </p>
    </div>
  );
}

function EmptyState(): React.ReactElement {
  const isMac =
    typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const shortcut = isMac ? '⌘⇧K' : 'Ctrl+Shift+K';
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="font-medium text-sm">Your vault is empty</div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Add your first secret using the button above. <br />
        Open this popup any time with{' '}
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {shortcut}
        </kbd>
        .
      </p>
    </div>
  );
}
