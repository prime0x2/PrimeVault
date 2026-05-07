import { useId, useState } from 'react';
import { Alert, Button, Input, Label } from '../../components/form';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';
import { downloadJson } from '../backup/download';
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  ENCRYPTED_FORMAT,
  type EncryptedBackup,
} from '../backup/format';

interface ExportEncryptedFormProps {
  onCancel: () => void;
  onDone: () => void;
}

export function ExportEncryptedForm({
  onCancel,
  onDone,
}: ExportEncryptedFormProps): React.ReactElement {
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (password.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const envelope = await popupClient.send({
        kind: 'exportEncrypted',
        password,
      });
      const file: EncryptedBackup = {
        format: ENCRYPTED_FORMAT,
        formatVersion: BACKUP_FORMAT_VERSION,
        exportedAt: new Date().toISOString(),
        envelope,
      };
      downloadJson(backupFilename('encrypted'), file);
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
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <p className="text-text-dim text-xs leading-relaxed">
        Re-enter your master password. The downloaded file is encrypted — keep
        it somewhere safe, but it's only as strong as the password used to
        decrypt it.
      </p>
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
          autoFocus
        />
      </div>

      {error && (
        <Alert role="alert" tone="danger">
          {error}
        </Alert>
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
          disabled={password.length === 0 || submitting}
        >
          {submitting ? 'Preparing…' : 'Download backup'}
        </Button>
      </div>
    </form>
  );
}
