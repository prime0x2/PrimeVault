import { Pencil } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import type { Entry, EntryKind } from '../../storage/schema';

const KIND_LABELS: Record<EntryKind, string> = {
  api_key: 'API key',
  token: 'Token',
  password: 'Password',
  secret: 'Secret',
  other: 'Other',
};

interface EntryDetailsProps {
  entry: Entry;
  onEdit: () => void;
}

function formatDate(iso: string | undefined): string {
  if (iso === undefined) return '—';
  // For ISO datetimes (2026-05-05T12:00:00Z) and date-only (2026-05-05),
  // both pass through Date.parse cleanly.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function EntryDetails({
  entry,
  onEdit,
}: EntryDetailsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2.5 rounded-md bg-muted/40 px-3 py-2.5">
      {entry.notes && (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            Notes
          </span>
          <p className="whitespace-pre-wrap text-xs leading-relaxed">
            {entry.notes}
          </p>
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wide">
            Tags
          </span>
          <div className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
        <Field label="Kind">{KIND_LABELS[entry.kind]}</Field>
        <Field label="Expires">{formatDate(entry.expiresAt)}</Field>
        <Field label="Last copied">{formatDate(entry.lastUsedAt)}</Field>
        <Field label="Copies">{entry.copyCount}</Field>
        <Field label="Created">{formatDate(entry.createdAt)}</Field>
        <Field label="Updated">{formatDate(entry.updatedAt)}</Field>
      </dl>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="h-3 w-3" />
          Edit
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </>
  );
}
