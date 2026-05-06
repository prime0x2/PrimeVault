/*
 * Visual strength meter for a password input.
 *
 * Direction B: continuous entropy bar (gradient deep→accent), filled to a
 * percentage based on score. Mono caption + small mono percent badge above
 * the bar. Used by onboarding + change-password.
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
  0: 'very weak',
  1: 'weak',
  2: 'fair',
  3: 'strong',
  4: 'very strong',
};

const SCORE_PERCENT: Record<StrengthScore, number> = {
  0: 12,
  1: 32,
  2: 56,
  3: 78,
  4: 92,
};

export function StrengthMeter({
  id,
  length,
  score,
  crackTime,
  warning,
}: StrengthMeterProps): React.ReactElement {
  const tooShort = length > 0 && length < MIN_PASSWORD_LENGTH;
  const pct = score === null ? 0 : SCORE_PERCENT[score];

  const captionLeft =
    length === 0
      ? `min ${MIN_PASSWORD_LENGTH} chars`
      : tooShort
        ? `${MIN_PASSWORD_LENGTH - length} more to go`
        : score === null
          ? 'evaluating…'
          : SCORE_LABELS[score];

  const captionRight =
    score === null || tooShort || length === 0 ? '' : `crack ${crackTime}`;

  const accent =
    score === null
      ? 'var(--text-muted)'
      : score >= 3
        ? 'var(--accent)'
        : score === 2
          ? 'var(--warn)'
          : 'var(--danger)';

  return (
    <div id={id} className="flex flex-col gap-2" aria-live="polite">
      <div className="flex items-center justify-between font-mono text-[10.5px]">
        <span className="text-text-dim">{captionLeft}</span>
        <span style={{ color: accent }}>
          {score === null ? '—' : `${SCORE_LABELS[score]} · ${pct}%`}
        </span>
      </div>
      <div
        className="relative h-1 overflow-hidden rounded-[2px] bg-bg-elev"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Password strength"
      >
        <div
          className="absolute inset-y-0 left-0 transition-all"
          style={{
            width: `${pct}%`,
            background:
              score === null
                ? 'var(--text-muted)'
                : score >= 3
                  ? 'linear-gradient(90deg, var(--accent-deep), var(--accent))'
                  : accent,
          }}
        />
      </div>
      {captionRight !== '' && (
        <p className="font-mono text-[10.5px] text-text-muted">
          {captionRight}
          {warning && score !== null && score < 3 && (
            <span className={cn('ml-1')} style={{ color: 'var(--danger)' }}>
              · {warning}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
