import { useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';
import { readJsonFile } from '../backup/download';
import { BackupFormatError, parseEncryptedBackup } from '../backup/format';

interface ImportEncryptedFormProps {
  onCancel: () => void;
  onImported: () => void;
}

type State =
  | { kind: 'idle' }
  | { kind: 'fileChosen'; filename: string }
  | { kind: 'error'; message: string };

export function ImportEncryptedForm({
  onCancel,
  onImported,
}: ImportEncryptedFormProps): React.ReactElement {
  const fileId = useId();
  const passwordId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  // Parsed file payload is held in state separately from `state` so the UI
  // can keep the password field even after the file is chosen.
  const [parsed, setParsed] = useState<ReturnType<
    typeof parseEncryptedBackup
  > | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file = e.target.files?.[0];
    if (file === undefined) return;
    try {
      const raw = await readJsonFile(file);
      const backup = parseEncryptedBackup(raw);
      setParsed(backup);
      setState({ kind: 'fileChosen', filename: file.name });
    } catch (err) {
      setParsed(null);
      setState({
        kind: 'error',
        message:
          err instanceof BackupFormatError
            ? err.message
            : err instanceof SyntaxError
              ? 'File is not valid JSON.'
              : 'Could not read the backup file.',
      });
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (parsed === null || password.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await popupClient.send({
        kind: 'importEncrypted',
        envelope: parsed.envelope,
        password,
      });
      setPassword('');
      onImported();
    } catch (err) {
      setState({
        kind: 'error',
        message:
          err instanceof MessagingError && err.code === 'wrongPassword'
            ? 'Password is incorrect for this backup.'
            : err instanceof MessagingError
              ? err.message
              : 'Could not import the backup.',
      });
      setSubmitting(false);
    }
  }

  const ready =
    state.kind === 'fileChosen' && parsed !== null && password.length > 0;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <p className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs leading-relaxed dark:text-yellow-200">
        Importing a backup <strong>replaces</strong> your current vault. Make
        sure you've exported it first if there's anything you want to keep.
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fileId} className="text-sm">
          Backup file
        </Label>
        <Input
          id={fileId}
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
          className="cursor-pointer file:mr-3 file:rounded file:border file:border-input file:bg-muted file:px-2 file:py-0.5 file:text-foreground"
        />
        {state.kind === 'fileChosen' && (
          <p className="text-muted-foreground text-xs">
            Loaded <code className="font-mono">{state.filename}</code>. Enter
            the password it was exported with.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={passwordId} className="text-sm">
          Backup password
        </Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={state.kind !== 'fileChosen'}
        />
      </div>

      {state.kind === 'error' && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs"
        >
          {state.message}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={!ready || submitting}
        >
          {submitting ? 'Importing…' : 'Replace my vault'}
        </Button>
      </div>
    </form>
  );
}
