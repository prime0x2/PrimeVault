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
import type { Entry, EntryKind } from '../../storage/schema';
import { EntryForm } from './EntryForm';
import { EntryList } from './EntryList';
import type { ExpiryFilter, ExpiryUrgency } from './expiry';
import {
  buildExpiryCounts,
  buildKindCounts,
  type ExpiryCounts,
  pickInlineKinds,
  sortVisibleKinds,
  withUrgency,
} from './filters';
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
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>(null);
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

  // Compute urgency once per entry, then derive both kind counts and
  // expiry counts from the same pre-computed list. Avoids re-parsing
  // `expiresAt` in the filter step below. See filters.ts.
  const searchedWithUrgency = useMemo(
    () => withUrgency(searchedEntries),
    [searchedEntries],
  );
  const kindCounts = useMemo(
    () => buildKindCounts(searchedWithUrgency),
    [searchedWithUrgency],
  );
  const expiryCounts = useMemo(
    () => buildExpiryCounts(searchedWithUrgency),
    [searchedWithUrgency],
  );

  // Visible chip set: kinds that have entries, plus the active filter
  // (so a count-0 active chip stays clearable), sorted by count desc.
  const visibleKinds = useMemo(
    () => sortVisibleKinds(kindCounts, kindFilter),
    [kindCounts, kindFilter],
  );

  const filtered = useMemo(() => {
    let out = searchedWithUrgency;
    if (kindFilter !== null)
      out = out.filter((x) => x.entry.kind === kindFilter);
    if (expiryFilter !== null)
      out = out.filter((x) => x.urgency === expiryFilter);
    return out.map((x) => x.entry);
  }, [searchedWithUrgency, kindFilter, expiryFilter]);

  const hasQuery = debouncedQuery.trim() !== '';
  const hasFilter = hasQuery || kindFilter !== null || expiryFilter !== null;
  const hasEntries = entries.length > 0;
  const showChipRow =
    hasEntries &&
    !adding &&
    !editingEntry &&
    (visibleKinds.length > 1 ||
      kindFilter !== null ||
      expiryCounts.expired > 0 ||
      expiryCounts.soon > 0 ||
      expiryFilter !== null);
  // The no-matches state shows the user what their narrowing was. A typed
  // query is quoted; a filter-only narrowing renders the filter label
  // unquoted so it doesn't read like the user typed "expired" into the
  // search bar.
  const noMatches = hasQuery
    ? { kind: 'search' as const, query: debouncedQuery }
    : kindFilter !== null
      ? { kind: 'filter' as const, label: kindFilter }
      : expiryFilter !== null
        ? { kind: 'filter' as const, label: expiryFilter }
        : { kind: 'search' as const, query: '' };

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

      {/* filter chips — single row with overflow folding. Renders kind
          chips first (sorted by count), then any expiry chips
          (`expired` / `soon`) that have entries. Anything past the
          collapsed cap goes behind a trailing `+N`; either filter
          dimension being active forces the row to stay visible so the
          user can always clear back to `all`. */}
      {showChipRow && (
        <FilterChipRow
          allCount={searchedEntries.length}
          visibleKinds={visibleKinds}
          kindCounts={kindCounts}
          kindFilter={kindFilter}
          onSelectKind={setKindFilter}
          expiryCounts={expiryCounts}
          expiryFilter={expiryFilter}
          onSelectExpiry={setExpiryFilter}
          expanded={showAllKindChips}
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
          noMatches={noMatches}
          onAddEntry={() => setAdding(true)}
          onRequestEdit={setEditingEntry}
          onClearSearch={() => {
            setRawQuery('');
            setKindFilter(null);
            setExpiryFilter(null);
          }}
          clipboardClearSeconds={prefs.clipboardClearSeconds}
        />
      )}

      {state.kind === 'ready' && (adding || editingEntry) && (
        <div className="flex-1 overflow-y-auto px-[18px] pt-2 pb-3">
          {/* Terminal-flavored eyebrow — hidden in Calm direction. The
              parent's flex-col + gap layout already handles the missing
              row, so the form just sits closer to the top. */}
          <div className="terminal-only mb-2.5 font-mono text-[11px] text-text-muted">
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

// ───── Filter chip row ───────────────────────────────────────────────────

// Maximum filter chips (excluding the always-shown 'all') visible inline
// when the row is collapsed. With 'all' that's 4 chips on the first line,
// which fits the 360-px popup comfortably without wrapping. Expiry chips
// share this budget — when collapsed they live in the overflow group
// alongside any hidden kind chips.
const MAX_INLINE_FILTERS = 3;

function FilterChipRow({
  allCount,
  visibleKinds,
  kindCounts,
  kindFilter,
  onSelectKind,
  expiryCounts,
  expiryFilter,
  onSelectExpiry,
  expanded,
  onToggleExpanded,
}: {
  allCount: number;
  visibleKinds: readonly EntryKind[];
  kindCounts: Partial<Record<EntryKind, number>>;
  kindFilter: EntryKind | null;
  onSelectKind: (kind: EntryKind | null) => void;
  expiryCounts: ExpiryCounts;
  expiryFilter: ExpiryFilter;
  onSelectExpiry: (urgency: ExpiryFilter) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}): React.ReactElement {
  // Pin the active kind into the collapsed row so the user never loses
  // sight of their current filter when the rest is hidden.
  const inlineKinds = expanded
    ? visibleKinds
    : pickInlineKinds(visibleKinds, kindFilter, MAX_INLINE_FILTERS);
  const hiddenKindCount = visibleKinds.length - inlineKinds.length;

  // Expiry chips that should *exist* somewhere — either inline (expanded)
  // or in the overflow group (collapsed). A chip with count 0 only shows
  // up if it's the active filter, so it's still clearable.
  const expiryUrgencies: ('expired' | 'soon')[] = [];
  if (expiryCounts.expired > 0 || expiryFilter === 'expired')
    expiryUrgencies.push('expired');
  if (expiryCounts.soon > 0 || expiryFilter === 'soon')
    expiryUrgencies.push('soon');

  // When collapsed: kind chips inline + everything else (hidden kinds +
  // expiry chips) tucked behind `+N`. When expanded: everything inline.
  const overflowCount = expanded ? 0 : hiddenKindCount + expiryUrgencies.length;
  const showToggle = expanded ? expiryUrgencies.length > 0 : overflowCount > 0;

  return (
    <div className="flex flex-wrap gap-1.5 px-[14px] pb-2.5">
      <KindChip
        label="all"
        count={allCount}
        selected={kindFilter === null && expiryFilter === null}
        onClick={() => {
          onSelectKind(null);
          onSelectExpiry(null);
        }}
      />
      {inlineKinds.map((k) => (
        <KindChip
          key={k}
          label={k}
          count={kindCounts[k] ?? 0}
          selected={kindFilter === k}
          onClick={() => onSelectKind(kindFilter === k ? null : k)}
        />
      ))}
      {expanded &&
        expiryUrgencies.map((u) => (
          <ExpiryChip
            key={u}
            urgency={u}
            count={u === 'expired' ? expiryCounts.expired : expiryCounts.soon}
            selected={expiryFilter === u}
            onClick={() => onSelectExpiry(expiryFilter === u ? null : u)}
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

// ───── Expiry filter chip ────────────────────────────────────────────────

function ExpiryChip({
  urgency,
  count,
  selected,
  onClick,
}: {
  urgency: Exclude<ExpiryUrgency, 'ok'>;
  count: number;
  selected: boolean;
  onClick: () => void;
}): React.ReactElement {
  // Selected state borrows the urgency color so the row reads at a glance:
  // tapping `expired` colors the chip red, tapping `soon` colors it amber.
  const palette =
    urgency === 'expired'
      ? {
          border: 'var(--danger-border)',
          bg: 'var(--danger-soft)',
          text: 'var(--danger)',
        }
      : {
          border: 'var(--warn-border)',
          bg: 'var(--warn-soft)',
          text: 'var(--warn)',
        };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={
        selected
          ? {
              borderColor: palette.border,
              background: palette.bg,
              color: palette.text,
            }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 font-mono text-[10.5px] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        selected
          ? 'font-medium'
          : 'border-border-default bg-transparent text-text-dim hover:border-border-strong hover:text-text',
      )}
    >
      {urgency}
      <span
        style={selected ? { color: palette.text, opacity: 0.7 } : undefined}
        className={cn(!selected && 'text-text-muted')}
      >
        {count}
      </span>
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
