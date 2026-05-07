import { useEffect, useId, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  BrandHeader,
  PopupFooter,
  PopupShell,
  PrimaryButton,
  TerminalInput,
} from '../../components/terminal';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError, type VaultStatus } from '../../messaging/protocol';
import { StrengthMeter } from '../passwords/StrengthMeter';
import {
  MIN_PASSWORD_LENGTH,
  type StrengthScore,
  scorePassword,
} from './strength';
import { validateSetup } from './validation';

// Read once at module load — the manifest is static for the lifetime of
// the popup, and getManifest() is synchronous.
const VERSION = browser.runtime.getManifest().version;

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
  const meterId = `${passwordId}-meter`;

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
    <PopupShell
      header={<BrandHeader status="setup" />}
      footer={
        <PopupFooter>
          <span>local-only · zero-knowledge</span>
          <span>v{VERSION}</span>
        </PopupFooter>
      }
    >
      <form
        onSubmit={onSubmit}
        className="flex flex-1 flex-col px-5.5 pt-6 pb-4.5"
        aria-label="Create your master password"
      >
        <div className="terminal-only mb-2.5 font-mono text-[11px] text-text-muted">
          <span className="text-accent">›</span> init vault
        </div>
        <h1 className="mb-2.5 font-semibold text-[26px] leading-[1.15] tracking-tight">
          Set your <span style={{ color: 'var(--accent)' }}>master key</span>.
        </h1>
        <p className="mb-5.5 max-w-[320px] text-[13px] text-text-dim leading-[1.55]">
          It unlocks everything. There is no recovery — only this device, only
          this key.
        </p>

        <div className="mb-3.5">
          <div className="mb-2 flex justify-between font-mono text-[11px]">
            <label htmlFor={passwordId} className="text-text-dim">
              master_password
            </label>
            <span aria-hidden className="text-text-muted">
              required
            </span>
          </div>
          <TerminalInput
            id={passwordId}
            type="password"
            autoComplete="new-password"
            autoFocus
            spacedValue={password.length > 0}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={meterId}
          />
          <div className="mt-2">
            <StrengthMeter
              id={meterId}
              length={password.length}
              score={scoreState.score}
              crackTime={scoreState.crackTime}
              warning={scoreState.warning}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 font-mono text-[11px] text-text-dim">
            <label htmlFor={confirmId}>confirm</label>
          </div>
          <TerminalInput
            id={confirmId}
            type="password"
            autoComplete="new-password"
            spacedValue={confirm.length > 0}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {confirm.length > 0 && confirm !== password && (
            <p
              className="mt-1.5 font-mono text-[10.5px]"
              style={{ color: 'var(--danger)' }}
            >
              passwords do not match
            </p>
          )}
        </div>

        {submitError && (
          <p
            role="alert"
            className="mt-3 rounded-md border px-3 py-2 font-mono text-[11px]"
            style={{
              color: 'var(--danger)',
              borderColor: 'var(--danger-border)',
              background: 'var(--danger-soft)',
            }}
          >
            {submitError}
          </p>
        )}

        <div className="flex-1" />

        <PrimaryButton type="submit" disabled={!validation.ok || submitting}>
          {submitting ? 'creating vault…' : 'Create vault'}
        </PrimaryButton>
        <p className="mt-2.5 text-center text-[10.5px] text-text-muted">
          <span className="terminal-only font-mono">
            password.never_leaves(this.device)
          </span>
          <span className="calm-only">
            Your password never leaves this device.
          </span>
        </p>
      </form>
    </PopupShell>
  );
}
