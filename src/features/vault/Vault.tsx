import { useCallback, useEffect, useMemo, useState } from 'react';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError } from '../../messaging/protocol';
import type { Entry } from '../../storage/schema';
import { AddEntryForm } from './AddEntryForm';
import { EntryList } from './EntryList';
import { SearchBar } from './SearchBar';
import { filterEntries } from './search';
import { usePopupPrefs } from './usePopupPrefs';
import { VaultHeader } from './VaultHeader';

interface VaultProps {
  onLocked: () => void;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: Entry[] }
  | { kind: 'error'; message: string };

const SEARCH_DEBOUNCE_MS = 80;

export function Vault({ onLocked }: VaultProps): React.ReactElement {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [locking, setLocking] = useState(false);
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
      setLocking(false);
      onLocked();
    }
  }

  const entries = state.kind === 'ready' ? state.entries : [];
  const filtered = useMemo(
    () => filterEntries(entries, debouncedQuery),
    [entries, debouncedQuery],
  );
  const hasQuery = debouncedQuery.trim() !== '';

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <VaultHeader onLock={lock} locking={locking} />
      <AddEntryForm onAdded={refresh} />
      {state.kind === 'ready' && entries.length > 0 && (
        <SearchBar
          value={rawQuery}
          onChange={setRawQuery}
          count={filtered.length}
          total={entries.length}
        />
      )}
      {state.kind === 'loading' && (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-muted-foreground text-xs">Loading…</div>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="font-medium text-sm">Couldn't load entries</div>
          <p className="text-muted-foreground text-xs">{state.message}</p>
        </div>
      )}
      {state.kind === 'ready' && (
        <EntryList
          entries={filtered}
          onMutated={refresh}
          filtered={hasQuery}
          clipboardClearSeconds={prefs.clipboardClearSeconds}
        />
      )}
    </div>
  );
}
