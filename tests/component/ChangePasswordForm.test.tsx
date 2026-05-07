// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

const scoreMock = vi.fn();
vi.mock('~/features/unlock/strength', async () => {
  const actual = await vi.importActual<
    typeof import('~/features/unlock/strength')
  >('~/features/unlock/strength');
  return { ...actual, scorePassword: scoreMock };
});

const { ChangePasswordForm } = await import(
  '~/features/options/ChangePasswordForm'
);
const { MessagingError } = await import('~/messaging/protocol');

const STRONG = {
  score: 4 as const,
  crackTime: 'centuries',
  warning: '',
  suggestions: [],
};
const SCORE_DEBOUNCE_MS = 250;
const NEW_PASSWORD = 'a strong new pass 1234';

async function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  await Promise.resolve();
  await Promise.resolve();
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    sendMock.mockReset();
    scoreMock.mockReset();
    scoreMock.mockResolvedValue(STRONG);
  });

  it('keeps Update disabled when current is empty', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ChangePasswordForm onCancel={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      NEW_PASSWORD,
    );
    await advance(SCORE_DEBOUNCE_MS + 50);

    const submit = screen.getByRole('button', {
      name: /update password/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    vi.useRealTimers();
  });

  it('flags the new password if it matches the current one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ChangePasswordForm onCancel={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/current password/i), NEW_PASSWORD);
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      NEW_PASSWORD,
    );
    await advance(SCORE_DEBOUNCE_MS + 50);

    expect(screen.getByText(/different from your current one/i)).toBeTruthy();
    const submit = screen.getByRole('button', {
      name: /update password/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    vi.useRealTimers();
  });

  it('flags a confirm mismatch', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<ChangePasswordForm onCancel={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/current password/i), 'oldpw1234567');
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      'totally different',
    );
    await advance(SCORE_DEBOUNCE_MS + 50);

    expect(screen.getByText(/passwords don't match/i)).toBeTruthy();
    vi.useRealTimers();
  });

  it('sends changePassword and shows the success alert on a clean update', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sendMock.mockResolvedValue({ state: 'unlocked', expiresAt: 1 });
    const onSuccess = vi.fn();
    render(<ChangePasswordForm onCancel={vi.fn()} onSuccess={onSuccess} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/current password/i), 'oldpw1234567');
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      NEW_PASSWORD,
    );
    await advance(SCORE_DEBOUNCE_MS + 50);

    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(sendMock).toHaveBeenCalledWith({
      kind: 'changePassword',
      currentPassword: 'oldpw1234567',
      newPassword: NEW_PASSWORD,
    });
    expect(await screen.findByText(/master password updated/i)).toBeTruthy();
    expect(onSuccess).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('translates a wrongPassword MessagingError into a user-friendly alert', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    sendMock.mockRejectedValue(new MessagingError('wrongPassword', 'nope'));
    render(<ChangePasswordForm onCancel={vi.fn()} onSuccess={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText(/current password/i),
      'wrongoldpw1234',
    );
    await user.type(screen.getByLabelText(/^new password$/i), NEW_PASSWORD);
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      NEW_PASSWORD,
    );
    await advance(SCORE_DEBOUNCE_MS + 50);
    await user.click(screen.getByRole('button', { name: /update password/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/current password is incorrect/i);
    vi.useRealTimers();
  });
});
