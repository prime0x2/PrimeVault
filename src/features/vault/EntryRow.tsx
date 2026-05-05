import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/cn';
import { popupClient } from '../../messaging/popup-client';
import type { ClipboardClearSeconds } from '../../storage/prefs';
import type { Entry } from '../../storage/schema';
import { EntryDetails } from './EntryDetails';
import { EntryForm } from './EntryForm';
import { ExpiryBadge } from './ExpiryBadge';
import { RowActions } from './RowActions';
import { useCopy } from './useCopy';

const REVEAL_TIMEOUT_MS = 8_000;
const MASKED_GLYPH = '•';
const MAX_MASK_LENGTH = 16;

function maskValue(value: string): string {
  return MASKED_GLYPH.repeat(Math.min(value.length, MAX_MASK_LENGTH));
}

interface EntryRowProps {
  entry: Entry;
  revealed: boolean;
  expanded: boolean;
  editing: boolean;
  confirmingDelete: boolean;
  onReveal: () => void;
  onMask: () => void;
  onToggleExpand: () => void;
  onRequestEdit: () => void;
  onCancelEdit: () => void;
  onSaved: () => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDeleted: () => void;
  onCopied: () => void;
  /** From prefs. 0 disables auto-clear. */
  clipboardClearSeconds: ClipboardClearSeconds;
}

export function EntryRow(props: EntryRowProps): React.ReactElement {
  const {
    entry,
    revealed,
    expanded,
    editing,
    confirmingDelete,
    onReveal,
    onMask,
    onToggleExpand,
    onRequestEdit,
    onCancelEdit,
    onSaved,
    onRequestDelete,
    onCancelDelete,
    onDeleted,
    onCopied,
    clipboardClearSeconds,
  } = props;

  const [deleting, setDeleting] = useState(false);

  const {
    copy,
    busy: copying,
    copyFlash,
    copyBanner,
    displaySeconds,
  } = useCopy({
    entryId: entry.id,
    entryValue: entry.value,
    clipboardClearSeconds,
    onCopied,
  });

  // Auto-mask after a fixed timeout while the popup is open. The popup is
  // destroyed on close, so revealedId resets to null on next open without
  // any extra plumbing.
  useEffect(() => {
    if (!revealed) return;
    const handle = window.setTimeout(onMask, REVEAL_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
  }, [revealed, onMask]);

  if (editing) {
    return (
      <li className="border-b bg-muted/30 px-3 py-3">
        <EntryForm entry={entry} onSaved={onSaved} onCancel={onCancelEdit} />
      </li>
    );
  }

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    try {
      await popupClient.send({ kind: 'deleteEntry', id: entry.id });
      onDeleted();
    } finally {
      setDeleting(false);
    }
  }

  const busy = copying || deleting;

  return (
    <li
      className={cn(
        'group flex flex-col gap-1.5 border-b px-3 py-2.5 transition-colors',
        confirmingDelete && 'bg-destructive/5',
        expanded && 'bg-muted/20',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="-ml-1 flex min-w-0 flex-1 items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Collapse details for ${entry.name}`
              : `Show details for ${entry.name}`
          }
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-medium text-sm">{entry.name}</span>
          <ExpiryBadge expiresAt={entry.expiresAt} />
        </button>
        <RowActions
          entryName={entry.name}
          revealed={revealed}
          busy={busy}
          copyFlash={copyFlash}
          onReveal={onReveal}
          onMask={onMask}
          onCopy={copy}
          onRequestDelete={onRequestDelete}
        />
      </div>

      <code className="block min-h-[1rem] truncate pl-4 font-mono text-muted-foreground text-xs">
        {revealed ? entry.value : maskValue(entry.value)}
      </code>

      {copyBanner && (
        <p
          className="pl-4 text-[11px] text-emerald-700 dark:text-emerald-300"
          aria-live="polite"
        >
          {displaySeconds > 0
            ? `Copied — clears in ${displaySeconds}s.`
            : 'Copied to clipboard.'}
        </p>
      )}

      {expanded && (
        <div className="pt-1">
          <EntryDetails entry={entry} onEdit={onRequestEdit} />
        </div>
      )}

      {confirmingDelete && (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-background px-2 py-1.5">
          <span className="text-xs">
            Delete <strong>{entry.name}</strong>?
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelDelete}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={deleting}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
