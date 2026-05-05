import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { popupClient } from '../../messaging/popup-client';
import { type EntryInput, MessagingError } from '../../messaging/protocol';
import { ENTRY_KINDS, type Entry, type EntryKind } from '../../storage/schema';
import { TagInput } from './TagInput';

interface EntryFormProps {
  /** When provided, form runs in edit mode and pre-fills from this entry. */
  entry?: Entry;
  onSaved: () => void;
  onCancel: () => void;
}

const KIND_LABELS: Record<EntryKind, string> = {
  api_key: 'API key',
  token: 'Token',
  password: 'Password',
  secret: 'Secret',
  other: 'Other',
};

export function EntryForm({
  entry,
  onSaved,
  onCancel,
}: EntryFormProps): React.ReactElement {
  const editing = entry !== undefined;
  const nameId = useId();
  const valueId = useId();
  const notesId = useId();
  const kindId = useId();
  const expiresId = useId();

  const [name, setName] = useState(entry?.name ?? '');
  const [value, setValue] = useState(entry?.value ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'secret');
  const [expiresAt, setExpiresAt] = useState(entry?.expiresAt ?? '');
  // Auto-expand "more fields" when editing an entry that already has any of
  // the extended fields populated.
  const [showMore, setShowMore] = useState(
    Boolean(
      entry?.notes ||
        (entry?.tags && entry.tags.length > 0) ||
        entry?.expiresAt ||
        (entry?.kind !== undefined && entry.kind !== 'secret'),
    ),
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName !== '' && value !== '' && !saving;

  function buildInput(): EntryInput {
    return {
      name: trimmedName,
      value,
      notes: notes.trim() === '' ? (editing ? null : undefined) : notes.trim(),
      tags,
      kind,
      expiresAt: expiresAt === '' ? (editing ? null : undefined) : expiresAt,
    };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const input = buildInput();
      if (editing && entry) {
        await popupClient.send({ kind: 'updateEntry', id: entry.id, input });
      } else {
        await popupClient.send({ kind: 'addEntry', input });
      }
      onSaved();
    } catch (err) {
      const message =
        err instanceof MessagingError
          ? err.code === 'duplicateName'
            ? 'An entry with that name already exists.'
            : err.message
          : 'Could not save entry.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3"
      aria-label={editing ? `Edit ${entry?.name}` : 'Add a new entry'}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId} className="text-xs">
          Name
        </Label>
        <Input
          id={nameId}
          autoFocus={!editing}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. GitHub PAT"
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={valueId} className="text-xs">
          Value
        </Label>
        <Input
          id={valueId}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="The secret"
          maxLength={8192}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMore((s) => !s)}
        className="flex items-center gap-1 self-start text-muted-foreground text-xs hover:text-foreground"
      >
        {showMore ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
        {showMore ? 'Fewer fields' : 'More fields'}
      </button>

      {showMore && (
        <div className="flex flex-col gap-3 border-l-2 border-border/50 pl-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={notesId} className="text-xs">
              Notes
            </Label>
            <Textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional context"
              maxLength={2000}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Tags</Label>
            <TagInput value={tags} onChange={setTags} ariaLabel="Add tags" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={kindId} className="text-xs">
                Kind
              </Label>
              <Select
                id={kindId}
                value={kind}
                onChange={(e) => setKind(e.target.value as EntryKind)}
              >
                {ENTRY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={expiresId} className="text-xs">
                Expires
              </Label>
              <Input
                id={expiresId}
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!canSubmit}
          className="flex-1"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
