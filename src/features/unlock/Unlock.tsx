import { useId, useState } from 'react';
import {
  BrandHeader,
  BrandMarkLarge,
  PopupFooter,
  PopupShell,
  PrimaryButton,
  TerminalInput,
} from '../../components/terminal';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError, type VaultStatus } from '../../messaging/protocol';
import type { AutoLockMinutes } from '../../storage/prefs';
import { usePopupPrefs } from '../vault/usePopupPrefs';

interface UnlockProps {
  onUnlocked: (status: VaultStatus) => void;
}

function autoLockLabel(minutes: AutoLockMinutes): string {
  if (minutes === 0) return 'auto-lock off';
  return `auto-lock ${minutes}m`;
}

export function Unlock({ onUnlocked }: UnlockProps): React.ReactElement {
  const passwordId = useId();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefs = usePopupPrefs();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const status = await popupClient.send({ kind: 'unlock', password });
      onUnlocked(status);
    } catch (err) {
      // wrongPassword and corruptVault both mean "didn't work" — single
      // user-facing message. Distinction matters for telemetry, not UX.
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
    <PopupShell
      header={<BrandHeader />}
      footer={
        <PopupFooter>
          <span>encrypted · this device only</span>
          <span>{autoLockLabel(prefs.autoLockMinutes)}</span>
        </PopupFooter>
      }
    >
      <form
        onSubmit={onSubmit}
        className="flex flex-1 flex-col px-5.5 pt-7.5 pb-4.5"
        aria-label="Unlock your vault"
      >
        <div className="mb-5.5 flex justify-center">
          <BrandMarkLarge size={84} />
        </div>

        <h1 className="mb-1.5 text-center font-semibold text-[26px] leading-[1.1] tracking-tight">
          Welcome back.
        </h1>
        <p className="mb-6.5 text-center text-[13px] text-text-dim">
          Enter your master key.
        </p>

        <label htmlFor={passwordId} className="sr-only">
          Master password
        </label>
        <TerminalInput
          id={passwordId}
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="master key"
          spacedValue={password.length > 0}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? `${passwordId}-error` : undefined}
        />
        {error && (
          <p
            id={`${passwordId}-error`}
            role="alert"
            className="mt-2 font-mono text-[11px]"
            style={{ color: 'var(--danger)' }}
          >
            {error}
          </p>
        )}

        <div className="flex-1" />

        <PrimaryButton
          type="submit"
          disabled={password.length === 0 || submitting}
        >
          {submitting ? 'unlocking…' : 'Unlock'}
        </PrimaryButton>
        <div className="mt-2.5 text-center font-mono text-[10.5px] text-text-muted">
          forgot? <span className="text-text">there is no recovery</span> ·
          re-import backup
        </div>
      </form>
    </PopupShell>
  );
}
