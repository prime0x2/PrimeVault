/**
 * Icon-button cluster for an EntryRow: reveal/mask, copy, delete. Pulled
 * out of EntryRow to keep the row layout focused on layout — the action
 * cluster has its own ergonomics (entry-name-included aria labels per
 * SPEC §10.10, busy-state disabling) that benefit from being one
 * component.
 */

import { Check, Copy, Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';

interface RowActionsProps {
  entryName: string;
  revealed: boolean;
  busy: boolean;
  copyFlash: boolean;
  onReveal: () => void;
  onMask: () => void;
  onCopy: () => void;
  onRequestDelete: () => void;
}

export function RowActions({
  entryName,
  revealed,
  busy,
  copyFlash,
  onReveal,
  onMask,
  onCopy,
  onRequestDelete,
}: RowActionsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={revealed ? onMask : onReveal}
        aria-label={
          revealed
            ? `Hide value for ${entryName}`
            : `Reveal value for ${entryName}`
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
        onClick={onCopy}
        disabled={busy}
        aria-label={`Copy value for ${entryName}`}
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
        aria-label={`Delete ${entryName}`}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
