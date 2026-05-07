// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

// scorePassword is async + lazily-loaded; mock it directly so tests don't
// pull in the ~200KB zxcvbn chunk and don't depend on real scoring.
const scoreMock = vi.fn();
vi.mock('~/features/unlock/strength', async () => {
  const actual = await vi.importActual<
    typeof import('~/features/unlock/strength')
  >('~/features/unlock/strength');
  return {
    ...actual,
    scorePassword: scoreMock,
  };
});

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      getManifest: () => ({ version: '1.0.0' }),
    },
  },
}));

const { Onboarding } = await import('~/features/unlock/Onboarding');
const { MessagingError } = await import('~/messaging/protocol');

const STRONG = {
  score: 4 as const,
  crackTime: 'centuries',
  warning: '',
  suggestions: [],
};
const WEAK = {
  score: 1 as const,
  crackTime: 'less than a second',
  warning: 'common pattern',
  suggestions: [],
};

const SCORE_DEBOUNCE_MS = 250;
const PASSWORD_OK = 'correct horse battery staple 9!';

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  // Let the scoring promise resolve.
  await Promise.resolve();
  await Promise.resolve();
}

describe('Onboarding', () => {
  beforeEach(() => {
    sendMock.mockReset();
    scoreMock.mockReset();
    scoreMock.mockResolvedValue(STRONG);
  });

  it('keeps Create disabled while the password is below the length floor', async () => {
    render(<Onboarding onCreated={vi.fn()} />);
    const submit = screen.getByRole('button', {
      name: /^create vault$/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/master_password/i), 'short');
    expect(submit.disabled).toBe(true);
  });

  it('keeps Create disabled when the score is below 3 even at length floor', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    scoreMock.mockResolvedValue(WEAK);
    render(<Onboarding onCreated={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/master_password/i), 'aaaaaaaaaaaa');
    await user.type(screen.getByLabelText(/^confirm$/i), 'aaaaaaaaaaaa');
    await advance(SCORE_DEBOUNCE_MS + 50);

    const submit = screen.getByRole('button', {
      name: /^create vault$/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    vi.useRealTimers();
  });

  it('keeps Create disabled when confirm does not match', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Onboarding onCreated={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/master_password/i), PASSWORD_OK);
    await user.type(screen.getByLabelText(/^confirm$/i), 'differentpassword');
    await advance(SCORE_DEBOUNCE_MS + 50);

    expect(screen.getByText(/passwords do not match/i)).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: /^create vault$/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    vi.useRealTimers();
  });

  it('submits setupVault and forwards the new status when everything is valid', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sendMock.mockResolvedValue({ state: 'unlocked', expiresAt: 999 });
    const onCreated = vi.fn();
    render(<Onboarding onCreated={onCreated} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/master_password/i), PASSWORD_OK);
    await user.type(screen.getByLabelText(/^confirm$/i), PASSWORD_OK);
    await advance(SCORE_DEBOUNCE_MS + 50);

    await user.click(screen.getByRole('button', { name: /^create vault$/i }));

    expect(sendMock).toHaveBeenCalledWith({
      kind: 'setupVault',
      password: PASSWORD_OK,
    });
    expect(onCreated).toHaveBeenCalledWith({
      state: 'unlocked',
      expiresAt: 999,
    });
    vi.useRealTimers();
  });

  it('renders MessagingError messages back to the user on submit failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sendMock.mockRejectedValue(
      new MessagingError('alreadyInitialized', 'vault already exists'),
    );
    render(<Onboarding onCreated={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/master_password/i), PASSWORD_OK);
    await user.type(screen.getByLabelText(/^confirm$/i), PASSWORD_OK);
    await advance(SCORE_DEBOUNCE_MS + 50);
    await user.click(screen.getByRole('button', { name: /^create vault$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/vault already exists/i);
    vi.useRealTimers();
  });

  it('renders the manifest version in the footer', () => {
    render(<Onboarding onCreated={vi.fn()} />);
    expect(screen.getByText(/^v1\.0\.0$/i)).toBeTruthy();
  });
});
