import { useId, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError, type VaultStatus } from '../../messaging/protocol';

interface UnlockProps {
  onUnlocked: (status: VaultStatus) => void;
}

export function Unlock({ onUnlocked }: UnlockProps): React.ReactElement {
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const status = await popupClient.send({ kind: 'unlock', password });
      onUnlocked(status);
    } catch (err) {
      // wrongPassword and corruptVault both mean "didn't work" — present as a
      // single user-facing message. The distinction matters for telemetry, not
      // for this screen's UX.
      const message =
        err instanceof MessagingError
          ? err.code === 'wrongPassword'
            ? 'Wrong password.'
            : err.message
          : 'Could not unlock the vault.';
      setError(message);
      setPassword('');
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-1 flex-col gap-4 px-6 py-5"
      aria-label="Unlock your vault"
    >
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl tracking-tight">PrimeVault</h1>
        <p className="text-muted-foreground text-sm leading-snug">
          Enter your master password to unlock.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Master password</Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? `${passwordId}-error` : undefined}
        />
        {error && (
          <p
            id={`${passwordId}-error`}
            role="alert"
            className="text-destructive text-xs"
          >
            {error}
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Button type="submit" disabled={password.length === 0 || submitting}>
          {submitting ? 'Unlocking…' : 'Unlock'}
        </Button>
      </div>
    </form>
  );
}
