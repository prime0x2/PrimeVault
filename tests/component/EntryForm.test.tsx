// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

const { EntryForm } = await import('~/features/vault/EntryForm');

describe('EntryForm — add mode', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('disables Save until both required fields have content', async () => {
    const onSaved = vi.fn();
    const onCancel = vi.fn();
    render(<EntryForm onSaved={onSaved} onCancel={onCancel} />);

    const save = screen.getByRole('button', {
      name: /^save$/i,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^name$/i), 'GitHub PAT');
    expect(save.disabled).toBe(true);

    await user.type(screen.getByLabelText(/^value$/i), 'ghp_xxx');
    expect(save.disabled).toBe(false);
  });

  it('treats whitespace-only names as empty', async () => {
    render(<EntryForm onSaved={vi.fn()} onCancel={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^name$/i), '   ');
    await user.type(screen.getByLabelText(/^value$/i), 'value');
    const save = screen.getByRole('button', {
      name: /^save$/i,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('sends an addEntry message with the trimmed name on submit', async () => {
    sendMock.mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(<EntryForm onSaved={onSaved} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^name$/i), '  Token  ');
    await user.type(screen.getByLabelText(/^value$/i), 'secret');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'addEntry',
        input: expect.objectContaining({ name: 'Token', value: 'secret' }),
      }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('surfaces a friendly error when the SW reports a duplicate name', async () => {
    const { MessagingError } = await import('~/messaging/protocol');
    sendMock.mockRejectedValue(
      new MessagingError('duplicateName', 'name in use'),
    );
    const onSaved = vi.fn();
    render(<EntryForm onSaved={onSaved} onCancel={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^name$/i), 'GitHub PAT');
    await user.type(screen.getByLabelText(/^value$/i), 'ghp_xxx');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/already exists/i);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
