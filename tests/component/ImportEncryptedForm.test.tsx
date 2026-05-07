// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

const { ImportEncryptedForm } = await import(
  '~/features/options/ImportEncryptedForm'
);
const { MessagingError } = await import('~/messaging/protocol');

const VALID_ENVELOPE = {
  version: 1,
  kdf: {
    algo: 'PBKDF2-SHA256',
    iterations: 600_000,
    salt: 'AAAAAAAAAAAAAAAAAAAAAA==',
  },
  cipher: {
    algo: 'AES-GCM',
    iv: 'AAAAAAAAAAAAAAAA',
    ciphertext: 'AAAAAAAAAAAAAAAA',
  },
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

const VALID_BACKUP = {
  format: 'primevault-encrypted-backup',
  formatVersion: 1,
  exportedAt: '2026-05-01T00:00:00.000Z',
  envelope: VALID_ENVELOPE,
};

function makeFile(payload: unknown, name = 'backup.json'): File {
  return new File([JSON.stringify(payload)], name, {
    type: 'application/json',
  });
}

async function chooseFile(file: File): Promise<void> {
  const input = screen.getByLabelText(/backup file/i) as HTMLInputElement;
  // userEvent.upload would also work; fireEvent.change is enough here and
  // doesn't re-clobber the test environment's file machinery.
  fireEvent.change(input, { target: { files: [file] } });
  // file.text() is async in happy-dom — wait until the form has either
  // accepted the file (password field enabled) or surfaced an error.
  await waitFor(() => {
    const password = screen.getByLabelText(
      /backup password/i,
    ) as HTMLInputElement;
    const error = screen.queryByRole('alert');
    if (!password.disabled || error !== null) return;
    throw new Error('file not yet processed');
  });
}

describe('ImportEncryptedForm', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('disables the password field until a valid file is parsed', async () => {
    render(<ImportEncryptedForm onCancel={vi.fn()} onImported={vi.fn()} />);
    const password = screen.getByLabelText(
      /backup password/i,
    ) as HTMLInputElement;
    expect(password.disabled).toBe(true);

    await chooseFile(makeFile(VALID_BACKUP));
    expect(password.disabled).toBe(false);
  });

  it('surfaces a "not valid JSON" error for a malformed file', async () => {
    render(<ImportEncryptedForm onCancel={vi.fn()} onImported={vi.fn()} />);
    const input = screen.getByLabelText(/backup file/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [
          new File(['not json'], 'bad.json', { type: 'application/json' }),
        ],
      },
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/not valid json/i);
  });

  it('surfaces a format error for a JSON-but-not-our-shape file', async () => {
    render(<ImportEncryptedForm onCancel={vi.fn()} onImported={vi.fn()} />);
    await chooseFile(makeFile({ wrong: 'shape' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(/not a valid primevault/i);
  });

  it('sends importEncrypted when the user submits a valid file + password', async () => {
    sendMock.mockResolvedValue({ state: 'unlocked', expiresAt: 1 });
    const onImported = vi.fn();
    render(<ImportEncryptedForm onCancel={vi.fn()} onImported={onImported} />);
    const user = userEvent.setup();

    await chooseFile(makeFile(VALID_BACKUP));
    await user.type(screen.getByLabelText(/backup password/i), 'pw1234567890');
    await user.click(screen.getByRole('button', { name: /replace my vault/i }));

    expect(sendMock).toHaveBeenCalledWith({
      kind: 'importEncrypted',
      envelope: VALID_ENVELOPE,
      password: 'pw1234567890',
    });
    expect(onImported).toHaveBeenCalled();
  });

  it('rewrites a wrongPassword MessagingError into a friendly message', async () => {
    sendMock.mockRejectedValue(new MessagingError('wrongPassword', 'no'));
    render(<ImportEncryptedForm onCancel={vi.fn()} onImported={vi.fn()} />);
    const user = userEvent.setup();

    await chooseFile(makeFile(VALID_BACKUP));
    await user.type(screen.getByLabelText(/backup password/i), 'wrongpw1234');
    await user.click(screen.getByRole('button', { name: /replace my vault/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toMatch(
      /password is incorrect for this backup/i,
    );
  });
});
