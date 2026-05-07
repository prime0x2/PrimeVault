/**
 * Change-master-password form. Lives inside SecuritySection.
 *
 * Threat model points worth preserving:
 *  - Current password is verified server-side against the on-disk envelope
 *    (not against the in-memory key) so an unattended unlocked popup can't
 *    silently rotate the password.
 *  - New password reuses the same strength gate as onboarding (zxcvbn-ts
 *    score ≥ 3, length ≥ 12). Nothing weaker than what the user used at
 *    setup is acceptable.
 *  - Errors surface generically: we don't distinguish "wrong current
 *    password" from "corrupted vault" — same code path as unlock.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Input, Label } from '../../components/form';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';
import { StrengthMeter } from '../passwords/StrengthMeter';
import {
  MIN_ACCEPTABLE_SCORE,
  MIN_PASSWORD_LENGTH,
  type StrengthScore,
  scorePassword,
} from '../unlock/strength';

const SCORE_DEBOUNCE_MS = 250;

interface ScoreState {
  score: StrengthScore | null;
  crackTime: string;
  warning: string;
}

const emptyScoreState: ScoreState = { score: null, crackTime: '', warning: '' };

interface ChangePasswordFormProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export function ChangePasswordForm({
  onCancel,
  onSuccess,
}: ChangePasswordFormProps): React.ReactElement {
  const currentId = useId();
  const newId = useId();
  const confirmId = useId();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [scoreState, setScoreState] = useState<ScoreState>(emptyScoreState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const generation = useRef(0);

  useEffect(() => {
    if (next.length < MIN_PASSWORD_LENGTH) {
      setScoreState(emptyScoreState);
      return;
    }
    const myGen = ++generation.current;
    const handle = window.setTimeout(() => {
      scorePassword(next)
        .then((result) => {
          if (myGen !== generation.current) return;
          setScoreState({
            score: result.score,
            crackTime: result.crackTime,
            warning: result.warning,
          });
        })
        .catch(() => {
          if (myGen !== generation.current) return;
          setScoreState(emptyScoreState);
        });
    }, SCORE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [next]);

  const newOk =
    next.length >= MIN_PASSWORD_LENGTH &&
    scoreState.score !== null &&
    scoreState.score >= MIN_ACCEPTABLE_SCORE;
  const confirmOk = confirm === next && confirm.length > 0;
  const sameAsCurrent = current.length > 0 && current === next;
  const canSubmit =
    current.length > 0 && newOk && confirmOk && !sameAsCurrent && !submitting;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await popupClient.send({
        kind: 'changePassword',
        currentPassword: current,
        newPassword: next,
      });
      setDone(true);
      // Wipe the in-memory copies of the strings before we forward control;
      // the parent will unmount this form, which clears the JS heap on its
      // next GC cycle anyway, but doing this explicitly makes the timing
      // visible at the call site.
      setCurrent('');
      setNext('');
      setConfirm('');
      onSuccess();
    } catch (err) {
      const message =
        err instanceof MessagingError && err.code === 'wrongPassword'
          ? 'Current password is incorrect.'
          : err instanceof MessagingError
            ? err.message
            : 'Could not change password. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  }

  if (done) {
    // Brief success ack — parent typically collapses the form on next render.
    return <Alert tone="success">Master password updated.</Alert>;
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={currentId} className="text-sm">
          Current password
        </Label>
        <Input
          id={currentId}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={newId} className="text-sm">
          New password
        </Label>
        <Input
          id={newId}
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          aria-describedby={`${newId}-meter`}
        />
        <StrengthMeter
          id={`${newId}-meter`}
          length={next.length}
          score={scoreState.score}
          crackTime={scoreState.crackTime}
          warning={scoreState.warning}
        />
        {sameAsCurrent && (
          <p className="text-danger text-xs">
            Pick a password different from your current one.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={confirmId} className="text-sm">
          Confirm new password
        </Label>
        <Input
          id={confirmId}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm.length > 0 && confirm !== next && (
          <p className="text-danger text-xs">Passwords don't match.</p>
        )}
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
        <Button type="submit" size="sm" disabled={!canSubmit}>
          {submitting ? 'Updating…' : 'Update password'}
        </Button>
      </div>
    </form>
  );
}
