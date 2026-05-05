import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError, type VaultStatus } from '../../messaging/protocol';
import { StrengthMeter } from '../passwords/StrengthMeter';
import {
  MIN_PASSWORD_LENGTH,
  type StrengthScore,
  scorePassword,
} from './strength';
import { validateSetup } from './validation';

const SCORE_DEBOUNCE_MS = 250;

interface ScoreState {
  score: StrengthScore | null;
  crackTime: string;
  warning: string;
  suggestions: string[];
}

const emptyScoreState: ScoreState = {
  score: null,
  crackTime: '',
  warning: '',
  suggestions: [],
};

interface OnboardingProps {
  onCreated: (status: VaultStatus) => void;
}

export function Onboarding({ onCreated }: OnboardingProps): React.ReactElement {
  const passwordId = useId();
  const confirmId = useId();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [scoreState, setScoreState] = useState<ScoreState>(emptyScoreState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const generation = useRef(0);

  useEffect(() => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setScoreState(emptyScoreState);
      return;
    }
    const myGeneration = ++generation.current;
    const handle = window.setTimeout(() => {
      scorePassword(password)
        .then((result) => {
          if (myGeneration !== generation.current) return;
          setScoreState({
            score: result.score,
            crackTime: result.crackTime,
            warning: result.warning,
            suggestions: result.suggestions,
          });
        })
        .catch(() => {
          if (myGeneration !== generation.current) return;
          // Strength evaluation failed — fall back to "evaluating" so the
          // submit button stays disabled rather than silently allowing a
          // weak password through.
          setScoreState(emptyScoreState);
        });
    }, SCORE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(handle);
    };
  }, [password]);

  const validation = validateSetup({
    password,
    confirm,
    score: scoreState.score,
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validation.ok || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const status = await popupClient.send({
        kind: 'setupVault',
        password,
      });
      onCreated(status);
    } catch (err) {
      const message =
        err instanceof MessagingError
          ? err.message
          : 'Could not create vault. Please try again.';
      setSubmitError(message);
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-1 flex-col gap-4 px-6 py-5"
      aria-label="Create your master password"
    >
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl tracking-tight">
          Create your vault
        </h1>
        <p className="text-muted-foreground text-sm leading-snug">
          Pick a strong master password. It unlocks your vault and{' '}
          <strong className="text-foreground">cannot be recovered</strong> if
          you lose it.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <Label htmlFor={passwordId}>Master password</Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={`${passwordId}-meter`}
        />
        <StrengthMeter
          id={`${passwordId}-meter`}
          length={password.length}
          score={scoreState.score}
          crackTime={scoreState.crackTime}
          warning={scoreState.warning}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={confirmId}>Confirm password</Label>
        <Input
          id={confirmId}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm.length > 0 && confirm !== password && (
          <p className="text-destructive text-xs">Passwords don't match.</p>
        )}
      </div>

      {submitError && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-xs"
        >
          {submitError}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <Button type="submit" disabled={!validation.ok || submitting}>
          {submitting ? 'Creating vault…' : 'Create vault'}
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Your password never leaves this device.
        </p>
      </div>
    </form>
  );
}
