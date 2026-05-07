import { useId, useState } from 'react';
import { GhostButton, TerminalInput } from '../../components/terminal';
import { cn } from '../../lib/cn';
import { popupClient } from '../../messaging/popup-client';
import { type EntryInput, MessagingError } from '../../messaging/protocol';
import {
  ENTRY_KINDS,
  ENTRY_SCOPES,
  type Entry,
  type EntryKind,
  type EntryScope,
} from '../../storage/schema';
import { TagInput } from './TagInput';

interface EntryFormProps {
  /** When provided, form runs in edit mode and pre-fills from this entry. */
  entry?: Entry;
  onSaved: () => void;
  onCancel: () => void;
}

const KIND_LABELS: Record<EntryKind, string> = {
  api_key: 'api_key',
  token: 'token',
  password: 'password',
  secret: 'secret',
  other: 'other',
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
  const expiresId = useId();

  const [name, setName] = useState(entry?.name ?? '');
  const [value, setValue] = useState(entry?.value ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [tags, setTags] = useState<string[]>(entry?.tags ?? []);
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'secret');
  // New entries default to 'personal'; edit mode preserves whatever was saved
  // (including unscoped, which stays empty).
  const [scope, setScope] = useState<EntryScope | ''>(
    entry ? (entry.scope ?? '') : 'personal',
  );
  const [expiresAt, setExpiresAt] = useState(entry?.expiresAt ?? '');
  // Tags and notes collapse by default to keep Save/Cancel above the fold.
  // In edit mode we auto-expand when the entry has either set, so the user
  // can see what they're about to change.
  const hasOptional = !!entry?.notes || (entry?.tags?.length ?? 0) > 0;
  const [showMore, setShowMore] = useState(hasOptional);

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
      scope: scope === '' ? (editing ? null : undefined) : scope,
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
      className="flex flex-col gap-2.5"
      aria-label={editing ? `Edit ${entry?.name}` : 'Add a new entry'}
    >
      {/* Name */}
      <div>
        <div className="mb-1.5 flex items-center justify-between font-mono text-[10.5px]">
          <label htmlFor={nameId} className="text-text-dim">
            name
          </label>
          <span style={{ color: 'var(--accent)' }}>required</span>
        </div>
        <TerminalInput
          id={nameId}
          autoFocus={!editing}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="STRIPE_SECRET_KEY"
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Value */}
      <div>
        <div className="mb-1.5 flex items-center justify-between font-mono text-[10.5px]">
          <label htmlFor={valueId} className="text-text-dim">
            value
          </label>
          <span style={{ color: 'var(--accent)' }}>required</span>
        </div>
        <TerminalInput
          id={valueId}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="the secret"
          maxLength={8192}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Kind chips */}
      <div>
        <div className="mb-1.5 font-mono text-[10.5px] text-text-dim">kind</div>
        <div className="flex flex-wrap gap-1">
          {ENTRY_KINDS.map((k) => {
            const selected = kind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'rounded-[6px] border px-2.5 py-1.5 font-mono text-[11px] transition-colors',
                  selected
                    ? 'border-border-accent bg-accent-soft text-text'
                    : 'border-border-default bg-transparent text-text-dim hover:border-border-strong hover:text-text',
                )}
              >
                {KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Expires + Scope — 2-col grid per design. Always visible. */}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <div className="mb-1.5 font-mono text-[10.5px] text-text-dim">
            <label htmlFor={expiresId}>expires</label>
          </div>
          <input
            id={expiresId}
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            onClick={(e) => {
              // Native date inputs only open the picker when the calendar
              // indicator is clicked. showPicker() opens it from anywhere
              // inside the field. Chrome 99+ — safe for an MV3 extension.
              try {
                e.currentTarget.showPicker();
              } catch {
                // showPicker throws if not user-activated; fall back silently.
              }
            }}
            className="h-10 w-full cursor-pointer rounded-[10px] border border-border-default bg-bg-input px-3 font-mono text-[12.5px] text-text outline-none focus:border-border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
          />
        </div>
        <div>
          <div className="mb-1.5 font-mono text-[10.5px] text-text-dim">
            scope
          </div>
          <fieldset
            aria-label="scope"
            className="flex h-10 min-w-0 rounded-[10px] border border-border-default bg-bg-input p-[3px]"
          >
            {ENTRY_SCOPES.map((s) => {
              const selected = scope === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setScope(selected ? '' : s)}
                  className={cn(
                    'flex-1 rounded-[7px] border font-mono text-[11px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    selected
                      ? 'border-border-accent bg-accent-soft font-medium text-text'
                      : 'border-transparent text-text-dim hover:text-text',
                  )}
                >
                  {s}
                </button>
              );
            })}
          </fieldset>
        </div>
      </div>

      {/* Toggle for tags + notes — keeps Save/Cancel above the fold. Edit
          mode auto-expands when either field has a value. */}
      {!showMore && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="mt-1 inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-dashed border-border-strong font-mono text-[11.5px] text-text-dim hover:bg-bg-elev hover:text-text"
        >
          <span style={{ color: 'var(--accent)' }}>+</span> more options
          <span className="text-text-muted">· tags · note</span>
        </button>
      )}

      {showMore && (
        <>
          {/* Tags — full width */}
          <div>
            <div className="mb-1.5 font-mono text-[10.5px] text-text-dim">
              tags
            </div>
            <TagInput value={tags} onChange={setTags} ariaLabel="Add tags" />
          </div>

          {/* Notes */}
          <div>
            <div className="mb-1.5 font-mono text-[10.5px] text-text-dim">
              <label htmlFor={notesId}>note</label>
            </div>
            <textarea
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="rotated, owner, anything that helps future-you"
              maxLength={2000}
              rows={2}
              className="min-h-11 w-full resize-y rounded-[10px] border border-border-default bg-bg-input px-3 py-2.5 font-mono text-[11.5px] text-text leading-[1.5] outline-none placeholder:text-text-muted focus:border-border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]"
            />
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="font-mono text-[10.5px]"
          style={{ color: 'var(--danger)' }}
        >
          {error}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <GhostButton
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-10 flex-1 rounded-[10px]"
        >
          Cancel
        </GhostButton>
        <button
          type="submit"
          disabled={!canSubmit}
          className={cn(
            'inline-flex h-10 flex-[2] items-center justify-center rounded-[10px] font-sans font-semibold text-[13px] transition-colors',
            canSubmit
              ? 'bg-accent text-bg shadow-[0_4px_16px_-8px_var(--accent)] hover:brightness-110'
              : 'cursor-not-allowed border border-border-default bg-bg-elev text-text-dim',
          )}
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save'}
        </button>
      </div>
    </form>
  );
}
