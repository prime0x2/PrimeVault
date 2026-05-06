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
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';
import type { Entry } from '../../storage/schema';
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
  const filtered = useMemo(
    () => filterEntries(entries, debouncedQuery),
    [entries, debouncedQuery],
  );
  const hasQuery = debouncedQuery.trim() !== '';
  const hasEntries = entries.length > 0;

  return (
    <PopupShell
      header={<BrandHeader status="unlocked" />}
      footer={
        <PopupFooter>
          <span>
            {hasQuery
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
      {/* search command bar — always visible while there are entries */}
      {hasEntries && (
        <SearchBar
          value={rawQuery}
          onChange={setRawQuery}
          count={filtered.length}
          total={entries.length}
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

      {state.kind === 'ready' && !adding && (
        <EntryList
          entries={filtered}
          onMutated={refresh}
          filtered={hasQuery}
          query={debouncedQuery}
          onAddEntry={() => setAdding(true)}
          onClearSearch={() => setRawQuery('')}
          clipboardClearSeconds={prefs.clipboardClearSeconds}
        />
      )}

      {state.kind === 'ready' && adding && (
        <div className="flex-1 overflow-y-auto px-[18px] pt-2 pb-3">
          <div className="mb-2.5 font-mono text-[11px] text-text-muted">
            <span style={{ color: 'var(--accent)' }}>›</span> new secret
          </div>
          <EntryForm
            onSaved={() => {
              setAdding(false);
              refresh();
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {/* Bottom CTA — shown only when listing entries (not adding, not empty) */}
      {state.kind === 'ready' && !adding && hasEntries && !hasQuery && (
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
