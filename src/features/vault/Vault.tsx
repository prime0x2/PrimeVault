import { useCallback, useEffect, useMemo, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  BrandHeader,
  IconButton,
  LockIcon,
  PopupFooter,
  PopupShell,
  SettingsIcon,
} from '../../components/terminal';
import { cn } from '../../lib/cn';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';
import { ENTRY_KINDS, type Entry, type EntryKind } from '../../storage/schema';
import { EntryForm } from './EntryForm';
import { EntryList } from './EntryList';
import { SearchBar } from './SearchBar';
import { filterEntries } from './search';
import { usePopupPrefs } from './usePopupPrefs';

interface VaultProps {
  onLocked: () => void;
  /** Epoch ms when auto-lock will fire; null disables the countdown. */
  expiresAt: number | null;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: Entry[] }
  | { kind: 'error'; message: string };

const SEARCH_DEBOUNCE_MS = 80;

export function Vault({ onLocked, expiresAt }: VaultProps): React.ReactElement {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [locking, setLocking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [kindFilter, setKindFilter] = useState<EntryKind | null>(null);
  const [showAllKindChips, setShowAllKindChips] = useState(false);
  const [rawQuery, setRawQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const prefs = usePopupPrefs();

  const refresh = useCallback(async () => {
    try {
      const entries = await popupClient.send({ kind: 'getEntries' });
      setState({ kind: 'ready', entries });
    } catch (err) {
      // If the SW says we're locked (eviction race?), bubble up so App
      // re-evaluates status and routes to the unlock screen.
      if (err instanceof MessagingError && err.code === 'locked') {
        onLocked();
        return;
      }
      setState({
        kind: 'error',
        message:
          err instanceof MessagingError
            ? err.message
            : 'Could not load entries.',
      });
    }
  }, [onLocked]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Debounce the query before we run the filter. Datasets are tiny in
  // practice, but the debounce smooths typing in the UI and matches SPEC §10.7.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(rawQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [rawQuery]);

  async function lock() {
    if (locking) return;
    setLocking(true);
    try {
      await popupClient.send({ kind: 'lock' });
    } finally {
      // Fail-safe: even if the SW lock message itself errors (eviction race,
      // transient transport failure), the popup still routes to the locked
      // state. The SW's source of truth is its in-memory key, and a
      // locked-looking UI is strictly safer than a stuck "locking…".
      setLocking(false);
      onLocked();
    }
  }

  function openSettings(): void {
    browser.runtime.openOptionsPage();
  }

  const entries = state.kind === 'ready' ? state.entries : [];

  // Filter pipeline: search first, then kind. Counts and visibleKinds are
  // derived from the search-filtered set so the chips reflect what's
  // actually findable under the current query — typing 'stripe' should
  // narrow the chip counts down to whatever 'stripe' matches, not keep
  // showing the global totals.
  const searchedEntries = useMemo(
    () => filterEntries(entries, debouncedQuery),
    [entries, debouncedQuery],
  );

  const kindCounts = useMemo(() => {
    const counts: Partial<Record<EntryKind, number>> = {};
    for (const e of searchedEntries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    return counts;
  }, [searchedEntries]);

  // Order chips by descending count so the busiest kinds sit closest to
  // 'all'. Tie-break with the canonical ENTRY_KINDS order so the row stays
  // stable instead of shuffling each time counts change. The currently-
  // selected kind always stays visible (even at count 0) so the user
  // doesn't lose track of their active filter when a search empties its
  // bucket.
  const visibleKinds = useMemo(
    () =>
      ENTRY_KINDS.filter(
        (k) => (kindCounts[k] ?? 0) > 0 || k === kindFilter,
      ).sort((a, b) => {
        const diff = (kindCounts[b] ?? 0) - (kindCounts[a] ?? 0);
        if (diff !== 0) return diff;
        return ENTRY_KINDS.indexOf(a) - ENTRY_KINDS.indexOf(b);
      }),
    [kindCounts, kindFilter],
  );

  const filtered = useMemo(
    () =>
      kindFilter === null
        ? searchedEntries
        : searchedEntries.filter((e) => e.kind === kindFilter),
    [searchedEntries, kindFilter],
  );
  const hasQuery = debouncedQuery.trim() !== '';
  const hasFilter = hasQuery || kindFilter !== null;
  const hasEntries = entries.length > 0;
  // What we show in the no-matches state when nothing matches. Prefer the
  // search query (it's what the user typed); fall back to the kind label.
  const noMatchesQuery = hasQuery ? debouncedQuery : (kindFilter ?? '');

  return (
    <PopupShell
      header={<BrandHeader status="unlocked" />}
      footer={
        <PopupFooter>
          <span>
            {hasFilter
              ? `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}`
              : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`}
            {expiresAt !== null && (
              <>
                {' · '}
                locks in{' '}
                <Countdown
                  expiresAt={expiresAt}
                  className="text-accent"
                  onZero={onLocked}
                />
              </>
            )}
          </span>
          <span className="inline-flex gap-0.5">
            <IconButton
              onClick={lock}
              disabled={locking}
              aria-label="Lock vault"
              title="Lock vault"
            >
              <LockIcon />
            </IconButton>
            <IconButton
              onClick={openSettings}
              aria-label="Open settings"
              title="Settings"
            >
              <SettingsIcon />
            </IconButton>
          </span>
        </PopupFooter>
      }
    >
      {/* search command bar — visible on the list view only */}
      {hasEntries && !adding && !editingEntry && (
        <SearchBar
          value={rawQuery}
          onChange={setRawQuery}
          count={filtered.length}
          total={entries.length}
        />
      )}

      {/* kind filter chips — shown when there's more than one kind to choose
          between, or when a kind filter is active (so the user can clear
          back to 'all' even after a search narrows the visible kinds to
          one). Collapsed to a single line by default; the trailing `+N`
          chip expands the row when more kinds are present than fit. The
          chip whose kind is currently selected always stays visible so the
          active filter doesn't disappear behind the overflow toggle. */}
      {hasEntries &&
        !adding &&
        !editingEntry &&
        (visibleKinds.length > 1 || kindFilter !== null) && (
          <KindChipRow
            allCount={searchedEntries.length}
            visibleKinds={visibleKinds}
            counts={kindCounts}
            selected={kindFilter}
            expanded={showAllKindChips}
            onSelect={(k) => setKindFilter(k)}
            onToggleExpanded={() => setShowAllKindChips((v) => !v)}
          />
        )}

      {state.kind === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="font-mono text-[11px] text-text-muted">loading…</div>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-7 text-center">
          <div className="font-medium text-sm">Couldn't load entries</div>
          <p className="text-[11px] text-text-dim">{state.message}</p>
        </div>
      )}

      {state.kind === 'ready' && !adding && !editingEntry && (
        <EntryList
          entries={filtered}
          onMutated={refresh}
          filtered={hasFilter}
          query={noMatchesQuery}
          onAddEntry={() => setAdding(true)}
          onRequestEdit={setEditingEntry}
          onClearSearch={() => {
            setRawQuery('');
            setKindFilter(null);
          }}
          clipboardClearSeconds={prefs.clipboardClearSeconds}
        />
      )}

      {state.kind === 'ready' && (adding || editingEntry) && (
        <div className="flex-1 overflow-y-auto px-[18px] pt-2 pb-3">
          <div className="mb-2.5 font-mono text-[11px] text-text-muted">
            <span style={{ color: 'var(--accent)' }}>›</span>{' '}
            {editingEntry ? `edit ${editingEntry.name}` : 'new secret'}
          </div>
          <EntryForm
            {...(editingEntry ? { entry: editingEntry } : {})}
            onSaved={() => {
              setAdding(false);
              setEditingEntry(null);
              refresh();
            }}
            onCancel={() => {
              setAdding(false);
              setEditingEntry(null);
            }}
          />
        </div>
      )}

      {/* Bottom CTA — shown only when listing entries (not adding/editing, not filtered, not empty) */}
      {state.kind === 'ready' &&
        !adding &&
        !editingEntry &&
        hasEntries &&
        !hasFilter && (
          <div className="px-[14px] pt-2 pb-3">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex h-[38px] w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-border-strong bg-transparent font-mono text-[12px] text-text hover:bg-bg-elev"
            >
              <span style={{ color: 'var(--accent)' }}>+</span> new secret
            </button>
          </div>
        )}
    </PopupShell>
  );
}

// ───── Kind filter chip row ──────────────────────────────────────────────

// Number of kind chips (excluding the always-shown 'all') to keep visible
// when collapsed. With 'all' that's 4 chips on the row, which fits the
// 360-px popup comfortably without wrapping.
const COLLAPSED_KIND_CHIPS = 3;

function KindChipRow({
  allCount,
  visibleKinds,
  counts,
  selected,
  expanded,
  onSelect,
  onToggleExpanded,
}: {
  allCount: number;
  visibleKinds: readonly EntryKind[];
  counts: Partial<Record<EntryKind, number>>;
  selected: EntryKind | null;
  expanded: boolean;
  onSelect: (kind: EntryKind | null) => void;
  onToggleExpanded: () => void;
}): React.ReactElement {
  // Pin the active kind into the collapsed row so the user never loses
  // sight of their current filter when the rest is hidden.
  const inline = expanded
    ? visibleKinds
    : (() => {
        const head = visibleKinds.slice(0, COLLAPSED_KIND_CHIPS);
        if (selected && !head.includes(selected)) {
          return [...head.slice(0, COLLAPSED_KIND_CHIPS - 1), selected];
        }
        return head;
      })();
  const overflowCount = visibleKinds.length - inline.length;
  const showToggle = expanded || overflowCount > 0;

  return (
    <div className="flex flex-wrap gap-1.5 px-[14px] pb-2.5">
      <KindChip
        label="all"
        count={allCount}
        selected={selected === null}
        onClick={() => onSelect(null)}
      />
      {inline.map((k) => (
        <KindChip
          key={k}
          label={k}
          count={counts[k] ?? 0}
          selected={selected === k}
          onClick={() => onSelect(selected === k ? null : k)}
        />
      ))}
      {showToggle && (
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={
            expanded
              ? 'Show fewer filters'
              : `Show ${overflowCount} more filter${overflowCount === 1 ? '' : 's'}`
          }
          className="inline-flex items-center justify-center rounded-[6px] border border-border-default bg-transparent px-2.5 py-1 font-mono text-[10.5px] text-text-dim transition-colors hover:border-border-strong hover:text-text focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          {expanded ? '−' : `+${overflowCount}`}
        </button>
      )}
    </div>
  );
}

// ───── Kind filter chip ──────────────────────────────────────────────────

function KindChip({
  label,
  count,
  selected,
  onClick,
}: {
  label: string;
  count: number;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 font-mono text-[10.5px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        selected
          ? 'border-border-strong bg-bg-elev text-text'
          : 'border-border-default bg-transparent text-text-dim hover:border-border-strong hover:text-text',
      )}
    >
      {label}
      <span className="text-text-muted">{count}</span>
    </button>
  );
}

// ───── Lock countdown — ticks every second ────────────────────────────────

function Countdown({
  expiresAt,
  className,
  onZero,
}: {
  expiresAt: number;
  className?: string;
  onZero?: () => void;
}): React.ReactElement {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(handle);
  }, []);
  const remaining = Math.max(0, expiresAt - now);
  const totalSec = Math.ceil(remaining / 1000);
  const mm = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');

  // When the timer hits zero while the popup is open, route up to App so it
  // re-fetches status (which will return `locked`).
  useEffect(() => {
    if (totalSec === 0 && onZero) onZero();
  }, [totalSec, onZero]);

  return (
    <span className={className} aria-live="off">
      {mm}:{ss}
    </span>
  );
}
