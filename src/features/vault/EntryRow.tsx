import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/cn';
import { popupClient } from '../../messaging/popup-client';
import {
  type ClipboardClearSeconds,
  effectiveClipboardClearSeconds,
} from '../../storage/prefs';
import type { Entry } from '../../storage/schema';
import { EntryDetails } from './EntryDetails';
import { EntryForm } from './EntryForm';
import { ExpiryBadge } from './ExpiryBadge';

const REVEAL_TIMEOUT_MS = 8_000;
const COPY_FLASH_MS = 1_000;
/**
 * Inline "Copied — clears in Xs" banner stays visible until the clear
 * actually runs, capped so the row doesn't jiggle if the user picks
 * "Never". A separate cap from the actual SW-scheduled clear.
 */
const COPY_BANNER_MAX_MS = 8_000;
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

  const [copyFlash, setCopyFlash] = useState(false);
  const [copyBanner, setCopyBanner] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const handle = window.setTimeout(onMask, REVEAL_TIMEOUT_MS);
    return () => window.clearTimeout(handle);
  }, [revealed, onMask]);

  useEffect(() => {
    if (!copyFlash) return;
    const handle = window.setTimeout(() => setCopyFlash(false), COPY_FLASH_MS);
    return () => window.clearTimeout(handle);
  }, [copyFlash]);

  // Chrome alarms floor anything < 30s to ~30s, so the banner shows the
  // delay the user will actually experience, not the raw setting.
  const displaySeconds = effectiveClipboardClearSeconds(clipboardClearSeconds);

  useEffect(() => {
    if (!copyBanner) return;
    // Hide the banner by the time the actual clear runs (or after a cap
    // for "Never"). Doesn't have to match exactly — purely cosmetic.
    const ms = Math.min(
      displaySeconds > 0 ? displaySeconds * 1000 : COPY_BANNER_MAX_MS,
      COPY_BANNER_MAX_MS,
    );
    const handle = window.setTimeout(() => setCopyBanner(false), ms);
    return () => window.clearTimeout(handle);
  }, [copyBanner, displaySeconds]);

  if (editing) {
    return (
      <li className="border-b bg-muted/30 px-3 py-3">
        <EntryForm entry={entry} onSaved={onSaved} onCancel={onCancelEdit} />
      </li>
    );
  }

  async function copy() {
    if (busy) return;
    setBusy(true);
    try {
      await navigator.clipboard.writeText(entry.value);
      setCopyFlash(true);
      setCopyBanner(true);

      // Schedule the auto-clear in the SW so it survives the popup
      // closing. The SW uses chrome.alarms + an offscreen document. Best
      // effort: errors are non-fatal — the user has been told what we
      // tried to do, and the clipboard write itself already succeeded.
      const delayMs = clipboardClearSeconds * 1000;
      popupClient
        .send({ kind: 'scheduleClipboardClear', delayMs })
        .catch(() => undefined);

      popupClient
        .send({ kind: 'markUsed', id: entry.id })
        .then(() => onCopied())
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await popupClient.send({ kind: 'deleteEntry', id: entry.id });
      onDeleted();
    } finally {
      setBusy(false);
    }
  }

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
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={revealed ? onMask : onReveal}
            aria-label={
              revealed
                ? `Hide value for ${entry.name}`
                : `Reveal value for ${entry.name}`
            }
            title={revealed ? 'Hide' : 'Reveal'}
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={copy}
            disabled={busy}
            aria-label={`Copy value for ${entry.name}`}
            title="Copy"
          >
            {copyFlash ? (
              <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onRequestDelete}
            disabled={busy}
            aria-label={`Delete ${entry.name}`}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
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
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={confirmDelete}
              disabled={busy}
            >
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
