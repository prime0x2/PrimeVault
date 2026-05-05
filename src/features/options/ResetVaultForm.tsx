/**
 * Reset-vault confirmation form. Lives inside SecuritySection.
 *
 * SPEC §4.6: typed-phrase confirmation. The user must type the literal
 * string `RESET` (case-sensitive) to enable the destructive button — the
 * pattern of "make the destructive action awkward" is deliberately
 * borrowed from GitHub's repo deletion flow. There is no undo.
 *
 * After a successful reset, the popup will route to onboarding because the
 * SW now reports `state: 'uninitialized'`. We don't need to do anything
 * here besides forwarding success to the parent.
 */

import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';

const CONFIRMATION_PHRASE = 'RESET';

interface ResetVaultFormProps {
  onCancel: () => void;
  onReset: () => void;
}

export function ResetVaultForm({
  onCancel,
  onReset,
}: ResetVaultFormProps): React.ReactElement {
  const [phrase, setPhrase] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = phrase === CONFIRMATION_PHRASE && !submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await popupClient.send({ kind: 'resetVault' });
      onReset();
    } catch (err) {
      setError(
        err instanceof MessagingError
          ? err.message
          : 'Could not reset the vault. Please try again.',
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
        This will permanently delete your encrypted vault and every entry it
        contains. This action cannot be undone. Your preferences will be kept.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reset-confirm" className="text-sm">
          Type <code className="rounded bg-muted px-1 font-mono">RESET</code> to
          confirm
        </Label>
        <Input
          id="reset-confirm"
          type="text"
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-label="Type RESET to confirm"
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
          disabled={!canSubmit}
        >
          {submitting ? 'Resetting…' : 'Delete my vault'}
        </Button>
      </div>
    </form>
  );
}
