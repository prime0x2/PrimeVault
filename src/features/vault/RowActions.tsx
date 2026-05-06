/**
 * Direction B: row actions are copy + trash. Reveal was dropped earlier —
 * masked values are often longer than the row's width, so the inline copy is
 * the real action; details/edit lives in the expand panel.
 */

import { IconButton } from '../../components/terminal';

interface RowActionsProps {
  entryName: string;
  busy: boolean;
  copyFlash: boolean;
  onCopy: () => void;
  onRequestDelete: () => void;
}

export function RowActions({
  entryName,
  busy,
  copyFlash,
  onCopy,
  onRequestDelete,
}: RowActionsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-0">
      <IconButton
        onClick={onCopy}
        disabled={busy}
        aria-label={`Copy value for ${entryName}`}
        title="Copy"
        className="h-[26px] w-[26px] rounded-md"
      >
        {copyFlash ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            style={{ color: 'var(--accent)' }}
          >
            <path
              d="M3 8.5l3.5 3.5L13 5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
          >
            <rect
              x="5"
              y="5"
              width="8"
              height="8"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.3"
            />
            <path
              d="M3.5 10.5V4a1 1 0 0 1 1-1H10"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        )}
      </IconButton>
      <IconButton
        onClick={onRequestDelete}
        disabled={busy}
        aria-label={`Delete ${entryName}`}
        title="Delete"
        className="h-[26px] w-[26px] rounded-md hover:text-[var(--danger)]"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M3 5h10M6.5 5V3.5h3V5M5 5v8a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </IconButton>
    </div>
  );
}
