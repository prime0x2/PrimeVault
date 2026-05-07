import { useState } from 'react';
import { cn } from '../../lib/cn';
import type { ClipboardClearSeconds } from '../../storage/prefs';
import type { Entry } from '../../storage/schema';
import { EntryDetails } from './EntryDetails';
import { ExpiryBadge } from './ExpiryBadge';
import { RowActions } from './RowActions';
import { kindDotColor, relativeTime } from './relative-time';
import { useCopy } from './useCopy';

interface EntryRowProps {
  entry: Entry;
  expanded: boolean;
  selected: boolean;
  onToggleExpand: () => void;
  onRequestEdit: () => void;
  onRequestDelete: () => void;
  onCopied: () => void;
  /** From prefs. 0 disables auto-clear. */
  clipboardClearSeconds: ClipboardClearSeconds;
}

export function EntryRow(props: EntryRowProps): React.ReactElement {
  const {
    entry,
    expanded,
    selected,
    onToggleExpand,
    onRequestEdit,
    onRequestDelete,
    onCopied,
    clipboardClearSeconds,
  } = props;

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

  const [hovering, setHovering] = useState(false);
  const highlight = selected || expanded || hovering;

  return (
    <li
      className={cn(
        'mb-0.5 rounded-[8px] transition-colors',
        highlight
          ? 'border border-border-strong bg-bg-elev'
          : 'border border-transparent',
      )}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: kindDotColor(entry.kind) }}
        />
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex min-w-0 flex-1 flex-col rounded text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          aria-expanded={expanded}
          aria-label={
            expanded
              ? `Collapse details for ${entry.name}`
              : `Show details for ${entry.name}`
          }
        >
          <div className="mb-1 flex items-center gap-1.5">
            <span className="max-w-[160px] truncate font-medium font-mono text-[13px] text-text">
              {entry.name}
            </span>
            <ExpiryBadge expiresAt={entry.expiresAt} />
          </div>
          <div className="flex items-center gap-1 font-mono text-[10.5px]">
            <span className="text-text-muted">{entry.kind}</span>
            {entry.tags.map((t) => (
              <span key={t} className="text-text-dim">
                · {t}
              </span>
            ))}
            <span className="ml-auto text-text-muted">
              {relativeTime(entry.createdAt)}
            </span>
          </div>
        </button>
        <RowActions
          entryName={entry.name}
          busy={copying}
          copyFlash={copyFlash}
          onCopy={copy}
          onRequestDelete={onRequestDelete}
        />
      </div>

      {copyBanner && (
        <p
          className="px-3 pb-2 font-mono text-[11px]"
          style={{ color: 'var(--accent)' }}
          aria-live="polite"
        >
          {displaySeconds > 0
            ? `copied — clears in ${displaySeconds}s`
            : 'copied to clipboard'}
        </p>
      )}

      {expanded && (
        <div className="px-3 pb-3">
          <EntryDetails entry={entry} onEdit={onRequestEdit} />
        </div>
      )}
    </li>
  );
}
