// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

// Pre-locked prefs subscription so the auto-lock label has something to read.
let mockedPrefs = { autoLockMinutes: 2 };
vi.mock('~/features/vault/usePopupPrefs', () => ({
  usePopupPrefs: () => mockedPrefs,
}));

const { Unlock } = await import('~/features/unlock/Unlock');
const { MessagingError } = await import('~/messaging/protocol');

describe('Unlock', () => {
  beforeEach(() => {
    sendMock.mockReset();
    mockedPrefs = { autoLockMinutes: 2 };
  });

  it('disables Unlock until the password field has content', () => {
    render(<Unlock onUnlocked={vi.fn()} />);
    const submit = screen.getByRole('button', {
      name: /^unlock$/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('calls onUnlocked with the returned status on a successful unlock', async () => {
    sendMock.mockResolvedValue({ state: 'unlocked', expiresAt: 1234 });
    const onUnlocked = vi.fn();
    render(<Unlock onUnlocked={onUnlocked} />);
    const user = userEvent.setup();

    await user.type(
      screen.getByLabelText(/master password/i),
      'hunter22hunter',
    );
    await user.click(screen.getByRole('button', { name: /^unlock$/i }));

    expect(sendMock).toHaveBeenCalledWith({
      kind: 'unlock',
      password: 'hunter22hunter',
    });
    expect(onUnlocked).toHaveBeenCalledWith({
      state: 'unlocked',
      expiresAt: 1234,
    });
  });

  it('shows a friendly error and clears the password on wrongPassword', async () => {
    sendMock.mockRejectedValue(new MessagingError('wrongPassword', 'nope'));
    const onUnlocked = vi.fn();
    render(<Unlock onUnlocked={onUnlocked} />);
    const user = userEvent.setup();

    const password = screen.getByLabelText(/master password/i);
    await user.type(password, 'wrongpass1234');
    await user.click(screen.getByRole('button', { name: /^unlock$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/wrong password/i);
    expect((password as HTMLInputElement).value).toBe('');
    expect(onUnlocked).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for other MessagingError codes', async () => {
    sendMock.mockRejectedValue(new MessagingError('corruptVault', 'tampered'));
    render(<Unlock onUnlocked={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/master password/i), 'somepw1234567');
    await user.click(screen.getByRole('button', { name: /^unlock$/i }));

    const alert = await screen.findByRole('alert');
    // It surfaces err.message verbatim, not a hardcoded string.
    expect(alert.textContent ?? '').toMatch(/tampered/i);
  });

  it('renders the auto-lock label from prefs', () => {
    mockedPrefs = { autoLockMinutes: 15 };
    render(<Unlock onUnlocked={vi.fn()} />);
    expect(screen.getByText(/auto-lock 15m/i)).toBeTruthy();
  });

  it('renders "auto-lock off" when the user has chosen Never', () => {
    mockedPrefs = { autoLockMinutes: 0 };
    render(<Unlock onUnlocked={vi.fn()} />);
    expect(screen.getByText(/auto-lock off/i)).toBeTruthy();
  });
});
