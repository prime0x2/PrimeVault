// @vitest-environment happy-dom
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
vi.mock('~/messaging/popup-client', () => ({
  popupClient: { send: sendMock },
}));

import type { Entry } from '~/storage/schema';

const { EntryList } = await import('~/features/vault/EntryList');

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: '01HXX0000000000000000000VV',
    name: 'GitHub PAT',
    value: 'ghp_xxxxxxxxxxxxxxxxxxxx',
    tags: [],
    kind: 'token',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    copyCount: 0,
    ...overrides,
  };
}

const baseProps = {
  onMutated: vi.fn(),
  onRequestEdit: vi.fn(),
  clipboardClearSeconds: 30 as const,
};

describe('EntryList — empty states', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('renders the brand-mark empty state when there are no entries and no filter', () => {
    render(<EntryList {...baseProps} entries={[]} filtered={false} />);
    expect(screen.getByText(/vault is empty/i)).toBeTruthy();
  });

  it('renders the search-flavored no-matches state when filtered by a query', () => {
    render(
      <EntryList
        {...baseProps}
        entries={[]}
        filtered={true}
        noMatches={{ kind: 'search', query: 'stripe' }}
      />,
    );
    // The header includes the literal quoted query.
    expect(screen.getByText(/no entry matches/i)).toBeTruthy();
    expect(screen.getByText(/"stripe"/)).toBeTruthy();
  });

  it('renders the filter-flavored no-matches state when filtered by a chip', () => {
    render(
      <EntryList
        {...baseProps}
        entries={[]}
        filtered={true}
        noMatches={{ kind: 'filter', label: 'expired' }}
      />,
    );
    // The heading reads "No expired entries" — chip label is unquoted, no
    // "matches" wording. (The terminal-only eyebrow quotes the label —
    // that's a different element; assert only on the heading.)
    const heading = screen.getByRole('heading');
    expect(heading.textContent ?? '').toMatch(/no\s+expired\s+entries/i);
    expect(heading.textContent ?? '').not.toContain('"');
    expect(screen.getByText(/clear the filter/i)).toBeTruthy();
  });

  it('forwards the Clear button click to onClearSearch', async () => {
    const onClearSearch = vi.fn();
    render(
      <EntryList
        {...baseProps}
        entries={[]}
        filtered={true}
        noMatches={{ kind: 'search', query: 'x' }}
        onClearSearch={onClearSearch}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });
});

describe('EntryList — delete confirmation', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('opens a confirmation modal when a row asks to delete', async () => {
    render(
      <EntryList {...baseProps} entries={[makeEntry()]} filtered={false} />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /delete github pat/i }),
    );

    // The modal labels itself with the entry name.
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    const heading = dialog.querySelector('#delete-title');
    expect(heading?.textContent ?? '').toMatch(/delete.*github pat/i);
  });

  it('cancels without sending a deleteEntry message', async () => {
    render(
      <EntryList {...baseProps} entries={[makeEntry()]} filtered={false} />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /delete github pat/i }),
    );

    // The modal "Cancel" — the row's title button isn't named Cancel,
    // so this resolves to the dialog's button.
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(sendMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sends deleteEntry and pings onMutated when the user confirms', async () => {
    sendMock.mockResolvedValue({ deleted: true });
    const onMutated = vi.fn();
    render(
      <EntryList
        {...baseProps}
        onMutated={onMutated}
        entries={[makeEntry({ id: 'id-1' })]}
        filtered={false}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole('button', { name: /delete github pat/i }),
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(sendMock).toHaveBeenCalledWith({
      kind: 'deleteEntry',
      id: 'id-1',
    });
    expect(onMutated).toHaveBeenCalled();
  });
});

describe('EntryList — sorting', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sorts by lastUsedAt desc, then updatedAt desc, then name asc', () => {
    const entries: Entry[] = [
      makeEntry({
        id: 'a',
        name: 'AAA',
        updatedAt: '2026-05-01T00:00:00.000Z',
      }),
      makeEntry({
        id: 'b',
        name: 'BBB',
        updatedAt: '2026-05-03T00:00:00.000Z',
      }),
      makeEntry({
        id: 'c',
        name: 'CCC',
        lastUsedAt: '2026-05-04T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
      }),
    ];
    render(<EntryList {...baseProps} entries={entries} filtered={false} />);

    const names = screen
      .getAllByRole('listitem')
      .map((li) => li.querySelector('span.truncate')?.textContent ?? '');
    // CCC (lastUsedAt wins) → BBB (most recent updatedAt) → AAA
    expect(names).toEqual(['CCC', 'BBB', 'AAA']);
  });
});
