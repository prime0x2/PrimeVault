import { GhostButton } from '../../components/terminal';
import { type Entry, KIND_LABELS } from '../../storage/schema';

interface EntryDetailsProps {
  entry: Entry;
  onEdit: () => void;
}

function formatDate(iso: string | undefined): string {
  if (iso === undefined) return '—';
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
    <div className="flex flex-col gap-2.5 rounded-[8px] border border-border-default bg-bg-sunken px-3 py-2.5">
      {entry.notes && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-text-muted tracking-[0.18em]">
            NOTE
          </span>
          <p className="whitespace-pre-wrap font-mono text-[11.5px] text-text-dim leading-[1.5]">
            {entry.notes}
          </p>
        </div>
      )}

      {entry.tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9.5px] text-text-muted tracking-[0.18em]">
            TAGS
          </span>
          <div className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-[5px] border border-border-default bg-bg-elev px-2 py-0.5 font-mono text-[10.5px] text-text"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[10.5px]">
        <Field label="kind">{KIND_LABELS[entry.kind]}</Field>
        <Field label="scope">{entry.scope ?? '—'}</Field>
        <Field label="expires">{formatDate(entry.expiresAt)}</Field>
        <Field label="last copied">{formatDate(entry.lastUsedAt)}</Field>
        <Field label="copies">{entry.copyCount}</Field>
        <Field label="created">{formatDate(entry.createdAt)}</Field>
        <Field label="updated">{formatDate(entry.updatedAt)}</Field>
      </dl>

      <div className="flex justify-end">
        <GhostButton onClick={onEdit} className="h-8 rounded-[8px] text-[12px]">
          Edit
        </GhostButton>
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
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-text">{children}</dd>
    </>
  );
}
