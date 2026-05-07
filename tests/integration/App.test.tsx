// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      openOptionsPage: vi.fn(),
      getManifest: () => ({ version: '1.0.0' }),
    },
  },
}));

vi.mock('~/features/vault/usePopupPrefs', () => ({
  usePopupPrefs: () => ({
    autoLockMinutes: 2,
    clipboardClearSeconds: 30,
    theme: 'system',
    defaultEntryKind: 'secret',
    prefsVersion: 1,
  }),
}));

const App = (await import('~/entrypoints/popup/App')).default;

describe('App — phase machine', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('routes to Onboarding when status returns uninitialized', async () => {
    sendMock.mockResolvedValue({ state: 'uninitialized' });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /set your master key/i }),
    ).toBeTruthy();
  });

  it('routes to Unlock when status returns locked', async () => {
    sendMock.mockResolvedValue({ state: 'locked' });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: /welcome back/i }),
    ).toBeTruthy();
  });

  it('routes to Vault when status returns unlocked', async () => {
    // Two consecutive RPC calls: getStatus, then getEntries.
    sendMock
      .mockResolvedValueOnce({ state: 'unlocked', expiresAt: null })
      .mockResolvedValueOnce([]);
    render(<App />);
    // The empty-vault state is the cleanest signal that the Vault screen
    // has rendered.
    expect(await screen.findByText(/vault is empty/i)).toBeTruthy();
  });

  it('renders an error view with a Try again button when getStatus fails', async () => {
    const { MessagingError } = await import('~/messaging/protocol');
    sendMock.mockRejectedValue(new MessagingError('internal', 'no SW'));
    render(<App />);
    expect(await screen.findByText(/something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/no SW/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
  });
});
