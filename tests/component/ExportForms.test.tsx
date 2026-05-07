// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

const downloadJsonMock = vi.fn();
vi.mock('~/features/backup/download', () => ({
  downloadJson: downloadJsonMock,
  // Re-export the rest of the module surface in case ImportEncryptedForm is
  // pulled in elsewhere via this path.
  readJsonFile: vi.fn(),
}));

const { ExportEncryptedForm } = await import(
  '~/features/options/ExportEncryptedForm'
);
const { ExportPlaintextForm } = await import(
  '~/features/options/ExportPlaintextForm'
);
const { MessagingError } = await import('~/messaging/protocol');

describe('ExportEncryptedForm', () => {
  beforeEach(() => {
    sendMock.mockReset();
    downloadJsonMock.mockReset();
  });

  it('disables Download until a password is entered', () => {
    render(<ExportEncryptedForm onCancel={vi.fn()} onDone={vi.fn()} />);
    const submit = screen.getByRole('button', {
      name: /download backup/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('triggers a download with the returned envelope on success', async () => {
    sendMock.mockResolvedValue({
      version: 1,
      kdf: { algo: 'PBKDF2-SHA256', iterations: 1, salt: 'x' },
      cipher: { algo: 'AES-GCM', iv: 'x', ciphertext: 'x' },
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    });
    const onDone = vi.fn();
    render(<ExportEncryptedForm onCancel={vi.fn()} onDone={onDone} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/master password/i), 'pw1234567890');
    await user.click(screen.getByRole('button', { name: /download backup/i }));

    expect(sendMock).toHaveBeenCalledWith({
      kind: 'exportEncrypted',
      password: 'pw1234567890',
    });
    expect(downloadJsonMock).toHaveBeenCalled();
    const [filename, payload] = downloadJsonMock.mock.calls[0]!;
    expect(filename).toMatch(/^primevault-.*-backup\.json$/);
    expect(payload).toMatchObject({ format: 'primevault-encrypted-backup' });
    expect(onDone).toHaveBeenCalled();
  });

  it('surfaces a wrongPassword as a friendly alert', async () => {
    sendMock.mockRejectedValue(new MessagingError('wrongPassword', 'no'));
    render(<ExportEncryptedForm onCancel={vi.fn()} onDone={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/master password/i), 'wrongpw1234');
    await user.click(screen.getByRole('button', { name: /download backup/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/password is incorrect/i);
  });
});

describe('ExportPlaintextForm', () => {
  beforeEach(() => {
    sendMock.mockReset();
    downloadJsonMock.mockReset();
  });

  it('keeps Submit disabled until both ack checkbox AND password are present', async () => {
    render(<ExportPlaintextForm onCancel={vi.fn()} onDone={vi.fn()} />);
    const user = userEvent.setup();
    const submit = screen.getByRole('button', {
      name: /download plaintext export/i,
    }) as HTMLButtonElement;
    const password = screen.getByLabelText(
      /master password/i,
    ) as HTMLInputElement;

    expect(submit.disabled).toBe(true);
    expect(password.disabled).toBe(true);

    // Acknowledge first — that enables the password field.
    await user.click(screen.getByRole('checkbox'));
    expect(password.disabled).toBe(false);

    await user.type(password, 'pw1234567890');
    expect(submit.disabled).toBe(false);
  });

  it('downloads a plaintext-flavored backup payload on success', async () => {
    sendMock.mockResolvedValue([]);
    const onDone = vi.fn();
    render(<ExportPlaintextForm onCancel={vi.fn()} onDone={onDone} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('checkbox'));
    await user.type(screen.getByLabelText(/master password/i), 'pw1234567890');
    await user.click(
      screen.getByRole('button', { name: /download plaintext export/i }),
    );

    expect(sendMock).toHaveBeenCalledWith({
      kind: 'exportPlaintext',
      password: 'pw1234567890',
    });
    expect(downloadJsonMock).toHaveBeenCalled();
    const [filename, payload] = downloadJsonMock.mock.calls[0]!;
    expect(filename).toMatch(/plaintext-EXPORT/);
    expect(payload).toMatchObject({
      format: 'primevault-plaintext-backup',
      // Self-describing warning travels with the file.
      warning: expect.stringMatching(/plaintext/i),
    });
    expect(onDone).toHaveBeenCalled();
  });
});
