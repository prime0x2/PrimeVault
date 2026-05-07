// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

const { ResetVaultForm } = await import('~/features/options/ResetVaultForm');
const { MessagingError } = await import('~/messaging/protocol');

describe('ResetVaultForm', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('keeps the destructive button disabled until the user types RESET exactly', async () => {
    render(<ResetVaultForm onCancel={vi.fn()} onReset={vi.fn()} />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/type reset to confirm/i);
    const submit = screen.getByRole('button', {
      name: /delete my vault/i,
    }) as HTMLButtonElement;

    expect(submit.disabled).toBe(true);

    await user.type(input, 'reset');
    expect(submit.disabled).toBe(true); // case-sensitive

    await user.clear(input);
    await user.type(input, 'RESET');
    expect(submit.disabled).toBe(false);
  });

  it('sends resetVault and pings onReset on confirm', async () => {
    sendMock.mockResolvedValue({ state: 'uninitialized' });
    const onReset = vi.fn();
    render(<ResetVaultForm onCancel={vi.fn()} onReset={onReset} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/type reset to confirm/i), 'RESET');
    await user.click(screen.getByRole('button', { name: /delete my vault/i }));

    expect(sendMock).toHaveBeenCalledWith({ kind: 'resetVault' });
    expect(onReset).toHaveBeenCalled();
  });

  it('surfaces a MessagingError as an alert and leaves the form mounted', async () => {
    sendMock.mockRejectedValue(new MessagingError('internal', 'storage down'));
    const onReset = vi.fn();
    render(<ResetVaultForm onCancel={vi.fn()} onReset={onReset} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/type reset to confirm/i), 'RESET');
    await user.click(screen.getByRole('button', { name: /delete my vault/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/storage down/i);
    expect(onReset).not.toHaveBeenCalled();
  });

  it('forwards Cancel without sending a message', async () => {
    const onCancel = vi.fn();
    render(<ResetVaultForm onCancel={onCancel} onReset={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
