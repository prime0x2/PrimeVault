/**
 * Visual strength meter for a password input. Used by both the onboarding
 * screen (creating the master password) and the change-password screen in
 * Settings. The component is purely presentational — it consumes a score
 * and surface text from a parent that owns the debounced zxcvbn call.
 */

import { cn } from '../../lib/cn';
import { MIN_PASSWORD_LENGTH, type StrengthScore } from '../unlock/strength';

export interface StrengthMeterProps {
  /** DOM id; pair with aria-describedby on the related input. */
  id: string;
  length: number;
  /** `null` when too short to score, or while the async scorer is in flight. */
  score: StrengthScore | null;
  crackTime: string;
  warning: string;
}

const SCORE_LABELS: Record<StrengthScore, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
};

const SCORE_BAR_CLASS: Record<StrengthScore, string> = {
  0: 'bg-destructive',
  1: 'bg-destructive',
  2: 'bg-yellow-500 dark:bg-yellow-400',
  3: 'bg-emerald-500 dark:bg-emerald-400',
  4: 'bg-emerald-500 dark:bg-emerald-400',
};

const BAR_IDS = ['b1', 'b2', 'b3', 'b4', 'b5'] as const;

export function StrengthMeter({
  id,
  length,
  score,
  crackTime,
  warning,
}: StrengthMeterProps): React.ReactElement {
  const filled = score === null ? 0 : score + 1;
  const labelText =
    length === 0
      ? `Use at least ${MIN_PASSWORD_LENGTH} characters`
      : length < MIN_PASSWORD_LENGTH
        ? `${MIN_PASSWORD_LENGTH - length} more character${
            MIN_PASSWORD_LENGTH - length === 1 ? '' : 's'
          } to go`
        : score === null
          ? 'Checking strength…'
          : `${SCORE_LABELS[score]} • crack time ${crackTime}`;

  return (
    <div id={id} className="flex flex-col gap-1.5" aria-live="polite">
      <div
        className="flex h-1.5 gap-1"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={filled}
        aria-label="Password strength"
      >
        {BAR_IDS.map((barId, i) => {
          const active = i < filled;
          return (
            <div
              key={barId}
              className={cn(
                'flex-1 rounded-full transition-colors',
                active && score !== null ? SCORE_BAR_CLASS[score] : 'bg-muted',
              )}
            />
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        {labelText}
        {warning && score !== null && score < 3 && (
          <span className="text-destructive"> — {warning}</span>
        )}
      </p>
    </div>
  );
}
