import { useState } from 'react';
import { Button, Label, Select } from '../../components/form';
import {
  AUTO_LOCK_MINUTE_OPTIONS,
  type AutoLockMinutes,
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
  // Only one destructive flow can be open at a time.
  const [flow, setFlow] = useState<SubFlow>('idle');

  return (
    <section className="flex flex-col gap-5">
      <h2 className="font-mono text-[10.5px] text-text-muted tracking-[0.18em] uppercase">
        Security
      </h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="autoLockMinutes">Auto-lock after inactivity</Label>
        <Select
          id="autoLockMinutes"
          value={prefs.autoLockMinutes}
          onChange={(e) => {
            const next = Number(e.target.value) as AutoLockMinutes;
            void onChange({ autoLockMinutes: next });
          }}
          className="w-fit min-w-48 mt-1"
        >
          {AUTO_LOCK_MINUTE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {labelForAutoLock(m)}
            </option>
          ))}
        </Select>
        <p className="text-[12px] text-text-dim leading-relaxed">
          When the timer elapses, the in-memory key is wiped and you'll be
          prompted to unlock again. "Never" keeps the vault unlocked until you
          close the browser or click the lock button.
        </p>
      </div>

      <div className="flex flex-col gap-2 border-t border-border-default pt-4">
        <Label htmlFor="clipboardClearSeconds">
          Clear clipboard after copy
        </Label>
        <Select
          id="clipboardClearSeconds"
          value={prefs.clipboardClearSeconds}
          onChange={(e) => {
            const next = Number(e.target.value) as ClipboardClearSeconds;
            void onChange({ clipboardClearSeconds: next });
          }}
          className="w-fit min-w-48 mt-1"
        >
          {CLIPBOARD_CLEAR_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {labelForClipboardClear(s)}
            </option>
          ))}
        </Select>
        <p className="text-[12px] text-text-dim leading-relaxed">
          After you copy a value, the clipboard is overwritten with empty text
          on this timer. Clearing is unconditional — if you copied something
          else in the meantime, that copy is lost too.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border-default pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-[13px] text-text">
              Change master password
            </h3>
            <p className="text-[12px] text-text-dim leading-relaxed">
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
              setTimeout(() => setFlow('idle'), 1500);
            }}
          />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border-default pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3
              className="font-medium text-[13px]"
              style={{ color: 'var(--danger)' }}
            >
              Reset vault
            </h3>
            <p className="text-[12px] text-text-dim leading-relaxed">
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
