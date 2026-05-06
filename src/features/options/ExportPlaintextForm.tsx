import { useId, useState } from 'react';
import { Button, Input, Label } from '../../components/form';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';
import { downloadJson } from '../backup/download';
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  PLAINTEXT_FORMAT,
  type PlaintextBackup,
} from '../backup/format';

interface ExportPlaintextFormProps {
  onCancel: () => void;
  onDone: () => void;
}

const PLAINTEXT_WARNING =
  'This file contains your secrets in plaintext. Anyone with access ' +
  'to it can read every entry. Treat it with the same care as the ' +
  'secrets themselves.';

export function ExportPlaintextForm({
  onCancel,
  onDone,
}: ExportPlaintextFormProps): React.ReactElement {
  const passwordId = useId();
  const ackId = useId();
  const [password, setPassword] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!acknowledged || password.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const entries = await popupClient.send({
        kind: 'exportPlaintext',
        password,
      });
      const file: PlaintextBackup = {
        format: PLAINTEXT_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        warning: PLAINTEXT_WARNING,
        schemaVersion: 1,
        entries,
      };
      downloadJson(backupFilename('plaintext'), file);
      setPassword('');
      onDone();
    } catch (err) {
      setError(
        err instanceof MessagingError && err.code === 'wrongPassword'
          ? 'Password is incorrect.'
          : err instanceof MessagingError
            ? err.message
            : 'Could not export the vault.',
      );
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3"
      noValidate
    >
      <p className="text-destructive text-sm">
        Plaintext export is unencrypted. Every secret in your vault will be
        written to disk in readable form.
      </p>

      <label
        htmlFor={ackId}
        className="flex cursor-pointer items-start gap-2 text-xs leading-relaxed"
      >
        <input
          id={ackId}
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I understand the risks. I will treat the exported file like the
          secrets themselves and delete it when I'm done.
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={passwordId} className="text-sm">
          Master password
        </Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={!acknowledged}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs"
        >
          {error}
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
          disabled={!acknowledged || password.length === 0 || submitting}
        >
          {submitting ? 'Preparing…' : 'Download plaintext export'}
        </Button>
      </div>
    </form>
  );
}
