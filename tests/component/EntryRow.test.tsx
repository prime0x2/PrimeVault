// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

import type { Entry as EntryT } from '~/storage/schema';

const { EntryRow } = await import('~/features/vault/EntryRow');

function makeEntry(overrides: Partial<EntryT> = {}): EntryT {
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

// happy-dom provides a working `navigator.clipboard`, so the test asserts
// the *side effects* of a successful write (the banner appearing + the SW
// RPCs firing) rather than spying on writeText directly. Direct spying is
// brittle here because both happy-dom and userEvent v14 install their own
// clipboard implementations and they fight over the reference.
beforeEach(() => {
  sendMock.mockReset();
});

const baseProps = {
  expanded: false,
  onToggleExpand: vi.fn(),
  onRequestEdit: vi.fn(),
  onRequestDelete: vi.fn(),
  onCopied: vi.fn(),
  clipboardClearSeconds: 30 as const,
};

describe('EntryRow', () => {
  it('renders the entry name and meta line including scope when set', () => {
    render(
      <EntryRow
        {...baseProps}
        entry={makeEntry({ scope: 'work', tags: ['prod', 'ci'] })}
      />,
    );
    expect(screen.getByText('GitHub PAT')).toBeTruthy();
    // The meta line lives inside the toggle button.
    const toggle = screen.getByRole('button', {
      name: /show details for github pat/i,
    });
    const meta = toggle.textContent ?? '';
    expect(meta).toContain('token');
    expect(meta).toContain('· work');
    expect(meta).toContain('· prod');
    expect(meta).toContain('· ci');
  });

  it('omits the scope segment when no scope is set', () => {
    render(<EntryRow {...baseProps} entry={makeEntry({ scope: undefined })} />);
    const toggle = screen.getByRole('button', {
      name: /show details for github pat/i,
    });
    const meta = toggle.textContent ?? '';
    expect(meta).not.toMatch(/· work/);
    expect(meta).not.toMatch(/· personal/);
  });

  it('writes the value to the clipboard and pings markUsed + scheduleClipboardClear', async () => {
    sendMock.mockResolvedValue(undefined);
    const onCopied = vi.fn();
    render(<EntryRow {...baseProps} onCopied={onCopied} entry={makeEntry()} />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /copy value for github pat/i }),
    );

    // The banner only renders after `await navigator.clipboard.writeText`
    // resolves cleanly — its presence proves the clipboard write happened.
    expect(await screen.findByText(/copied — clears in 30s/i)).toBeTruthy();

    // Both round-trips fire. Their order isn't load-bearing.
    const kinds = sendMock.mock.calls.map(
      (c) => (c[0] as { kind: string }).kind,
    );
    expect(kinds).toContain('scheduleClipboardClear');
    expect(kinds).toContain('markUsed');

    const scheduleCall = sendMock.mock.calls.find(
      (c) => (c[0] as { kind: string }).kind === 'scheduleClipboardClear',
    );
    expect(scheduleCall?.[0]).toMatchObject({
      kind: 'scheduleClipboardClear',
      delayMs: 30_000,
    });
  });

  it('shows "copied to clipboard" (no delay) when auto-clear is disabled', async () => {
    sendMock.mockResolvedValue(undefined);
    render(
      <EntryRow {...baseProps} entry={makeEntry()} clipboardClearSeconds={0} />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /copy value for github pat/i }),
    );
    expect(await screen.findByText(/copied to clipboard/i)).toBeTruthy();
  });

  it('does not crash when scheduleClipboardClear or markUsed reject', async () => {
    sendMock.mockRejectedValue(new Error('boom'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<EntryRow {...baseProps} entry={makeEntry()} />);

    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /copy value for github pat/i }),
    );
    // Clipboard write itself succeeded; the banner appears regardless of
    // RPC failure.
    expect(await screen.findByText(/copied/i)).toBeTruthy();
    // The warn happens inside a fire-and-forget .catch — flush microtasks
    // until both rejected promises have routed into their handlers.
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('renders an expiry badge when the entry expires soon', () => {
    // 5 days from now (well under the 14-day soon threshold)
    const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    render(<EntryRow {...baseProps} entry={makeEntry({ expiresAt: soon })} />);
    expect(screen.getByText(/exp \d+d/i)).toBeTruthy();
  });

  it('renders an EntryDetails panel when expanded', () => {
    render(
      <EntryRow
        {...baseProps}
        expanded={true}
        entry={makeEntry({ scope: 'personal' })}
      />,
    );
    // EntryDetails renders the Edit button and a kind field.
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeTruthy();
    expect(screen.getByText('kind')).toBeTruthy();
    expect(screen.getByText('scope')).toBeTruthy();
  });

  it('forwards delete clicks to onRequestDelete without confirmation', async () => {
    const onRequestDelete = vi.fn();
    render(
      <EntryRow
        {...baseProps}
        onRequestDelete={onRequestDelete}
        entry={makeEntry()}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /delete github pat/i }),
    );
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
  });
});
