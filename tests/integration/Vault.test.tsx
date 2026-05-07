// @vitest-environment happy-dom
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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

import type { Entry } from '~/storage/schema';

const { Vault } = await import('~/features/vault/Vault');

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '01HXX0000000000000000000VV',
    name: 'GitHub PAT',
    value: 'ghp_xxxxxxxxxxxxxxxxxxxx',
    tags: ['ci'],
    kind: 'token',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    copyCount: 0,
    ...overrides,
  };
}

const SAMPLE_ENTRIES: Entry[] = [
  makeEntry({ id: 'a', name: 'GitHub PAT', kind: 'token' }),
  makeEntry({ id: 'b', name: 'Stripe live key', kind: 'api_key' }),
  makeEntry({ id: 'c', name: 'Personal note', kind: 'secret', tags: ['life'] }),
];

describe('Vault — happy paths', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('renders the loading state, then the list, when getEntries resolves', async () => {
    sendMock.mockResolvedValue(SAMPLE_ENTRIES);
    render(<Vault onLocked={vi.fn()} expiresAt={null} />);

    // Initial loading text shows up before the first await.
    expect(screen.getByText(/loading…/i)).toBeTruthy();

    // List entries appear after the getEntries response arrives.
    expect(await screen.findByText('GitHub PAT')).toBeTruthy();
    expect(screen.getByText('Stripe live key')).toBeTruthy();
    expect(screen.getByText('Personal note')).toBeTruthy();
  });

  it('shows the count in the footer, and pluralises correctly', async () => {
    sendMock.mockResolvedValue(SAMPLE_ENTRIES);
    render(<Vault onLocked={vi.fn()} expiresAt={null} />);
    await screen.findByText('GitHub PAT');
    expect(screen.getByText(/3 entries/i)).toBeTruthy();
  });

  it('narrows the list when the user types in the search bar', async () => {
    sendMock.mockResolvedValue(SAMPLE_ENTRIES);
    render(<Vault onLocked={vi.fn()} expiresAt={null} />);
    await screen.findByText('GitHub PAT');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search entries/i), 'stripe');

    // The debounce is 80ms; waitFor polls until the filter has run.
    await waitFor(() => {
      expect(screen.queryByText('GitHub PAT')).toBeNull();
    });
    expect(screen.getByText('Stripe live key')).toBeTruthy();
  });

  it('routes the lock button click to the SW and to onLocked', async () => {
    sendMock.mockResolvedValue(SAMPLE_ENTRIES);
    const onLocked = vi.fn();
    render(<Vault onLocked={onLocked} expiresAt={null} />);
    await screen.findByText('GitHub PAT');

    sendMock.mockClear();
    sendMock.mockResolvedValueOnce({ state: 'locked' });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /lock vault/i }));

    expect(sendMock).toHaveBeenCalledWith({ kind: 'lock' });
    await waitFor(() => expect(onLocked).toHaveBeenCalled());
  });

  it('still routes to onLocked when the SW lock RPC errors out (failsafe)', async () => {
    sendMock.mockResolvedValue(SAMPLE_ENTRIES);
    const onLocked = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<Vault onLocked={onLocked} expiresAt={null} />);
    await screen.findByText('GitHub PAT');

    sendMock.mockClear();
    sendMock.mockRejectedValueOnce(new Error('transport down'));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /lock vault/i }));

    await waitFor(() => expect(onLocked).toHaveBeenCalled());
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Vault — empty + error states', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('renders the brand-mark empty state when getEntries returns []', async () => {
    sendMock.mockResolvedValue([]);
    render(<Vault onLocked={vi.fn()} expiresAt={null} />);
    expect(await screen.findByText(/vault is empty/i)).toBeTruthy();
  });

  it('renders an error view when getEntries rejects with a non-locked error', async () => {
    const { MessagingError } = await import('~/messaging/protocol');
    sendMock.mockRejectedValue(new MessagingError('internal', 'boom'));
    render(<Vault onLocked={vi.fn()} expiresAt={null} />);
    expect(await screen.findByText(/couldn't load entries/i)).toBeTruthy();
    expect(screen.getByText(/boom/i)).toBeTruthy();
  });

  it('routes to onLocked when getEntries reports the SW is locked', async () => {
    const { MessagingError } = await import('~/messaging/protocol');
    sendMock.mockRejectedValue(new MessagingError('locked', 'locked'));
    const onLocked = vi.fn();
    render(<Vault onLocked={onLocked} expiresAt={null} />);
    await waitFor(() => expect(onLocked).toHaveBeenCalled());
  });
});

describe('Vault — filter chips', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('renders chips for kinds that appear in the list, sorted by count', async () => {
    sendMock.mockResolvedValue([
      makeEntry({ id: 'a', kind: 'secret', name: 'one' }),
      makeEntry({ id: 'b', kind: 'secret', name: 'two' }),
      makeEntry({ id: 'c', kind: 'token', name: 'three' }),
    ]);
    render(<Vault onLocked={vi.fn()} expiresAt={null} />);
    await screen.findByText('one');

    // The 'all' chip is always shown when the row renders.
    expect(screen.getByRole('button', { name: /^all/i })).toBeTruthy();
    // Both populated kinds get chips.
    expect(screen.getByRole('button', { name: /^secret/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^token/i })).toBeTruthy();
  });

  it('narrows the list when a kind chip is selected', async () => {
    sendMock.mockResolvedValue([
      makeEntry({ id: 'a', kind: 'secret', name: 'sec one' }),
      makeEntry({ id: 'b', kind: 'token', name: 'tok one' }),
    ]);
    render(<Vault onLocked={vi.fn()} expiresAt={null} />);
    await screen.findByText('sec one');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^secret/i }));

    await waitFor(() => {
      expect(screen.queryByText('tok one')).toBeNull();
    });
    expect(screen.getByText('sec one')).toBeTruthy();
  });
});
