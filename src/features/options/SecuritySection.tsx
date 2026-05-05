import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import {
  AUTO_LOCK_MINUTE_OPTIONS,
  type AutoLockMinutes,
  CHROME_ALARMS_MIN_SECONDS,
  CLIPBOARD_CLEAR_OPTIONS,
  type ClipboardClearSeconds,
  type Prefs,
} from '../../storage/prefs';
import { ChangePasswordForm } from './ChangePasswordForm';
import { ResetVaultForm } from './ResetVaultForm';

interface SecuritySectionProps {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => Promise<void>;
}

type SubFlow = 'idle' | 'changing' | 'resetting';

export function SecuritySection({
  prefs,
  onChange,
}: SecuritySectionProps): React.ReactElement {
  // Only one destructive flow can be open at a time. Picking either
  // collapses the other so the page stays focused on a single action.
  const [flow, setFlow] = useState<SubFlow>('idle');

  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-semibold text-base tracking-tight">Security</h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="autoLockMinutes" className="text-sm">
          Auto-lock after inactivity
        </Label>
        <select
          id="autoLockMinutes"
          value={prefs.autoLockMinutes}
          onChange={(e) => {
            const next = Number(e.target.value) as AutoLockMinutes;
            void onChange({ autoLockMinutes: next });
          }}
          className="h-9 w-fit min-w-48 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {AUTO_LOCK_MINUTE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {labelForAutoLock(m)}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs leading-relaxed">
          When the timer elapses, the in-memory key is wiped and you'll be
          prompted to unlock again. "Never" keeps the vault unlocked until you
          close the browser or click the lock button.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <Label htmlFor="clipboardClearSeconds" className="text-sm">
          Clear clipboard after copy
        </Label>
        <select
          id="clipboardClearSeconds"
          value={prefs.clipboardClearSeconds}
          onChange={(e) => {
            const next = Number(e.target.value) as ClipboardClearSeconds;
            void onChange({ clipboardClearSeconds: next });
          }}
          className="h-9 w-fit min-w-48 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {CLIPBOARD_CLEAR_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {labelForClipboardClear(s)}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs leading-relaxed">
          After you copy a value, the clipboard is overwritten with empty text
          on this timer. Clearing is unconditional — if you copied something
          else in the meantime, that copy is lost too.
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Note: Chrome's alarm API has a {CHROME_ALARMS_MIN_SECONDS}-second
          minimum in production builds, so values below{' '}
          {CHROME_ALARMS_MIN_SECONDS}s are clamped up to{' '}
          {CHROME_ALARMS_MIN_SECONDS}s.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-sm">Change master password</h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Re-encrypts your vault with a new key. You'll need your current
              password.
            </p>
          </div>
          {flow !== 'changing' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFlow('changing')}
              disabled={flow === 'resetting'}
            >
              Change…
            </Button>
          )}
        </div>
        {flow === 'changing' && (
          <ChangePasswordForm
            onCancel={() => setFlow('idle')}
            onSuccess={() => {
              // Brief pause is handled by the form's internal "done" state;
              // collapse here so the user sees the section settle back.
              setTimeout(() => setFlow('idle'), 1500);
            }}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-destructive text-sm">
              Reset vault
            </h3>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Permanently deletes the encrypted vault and every entry. Your
              preferences are kept.
            </p>
          </div>
          {flow !== 'resetting' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFlow('resetting')}
              disabled={flow === 'changing'}
            >
              Reset…
            </Button>
          )}
        </div>
        {flow === 'resetting' && (
          <ResetVaultForm
            onCancel={() => setFlow('idle')}
            onReset={() => setFlow('idle')}
          />
        )}
      </div>
    </section>
  );
}

function labelForAutoLock(minutes: AutoLockMinutes): string {
  if (minutes === 0) return 'Never (until browser quit)';
  if (minutes === 1) return '1 minute';
  return `${minutes} minutes`;
}

function labelForClipboardClear(seconds: ClipboardClearSeconds): string {
  if (seconds === 0) return 'Never';
  return `${seconds} seconds`;
}
