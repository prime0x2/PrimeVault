import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Onboarding } from '../../features/unlock/Onboarding';
import { Unlock } from '../../features/unlock/Unlock';
import { Vault } from '../../features/vault/Vault';
import { popupClient } from '../../messaging/popup-client';
import { MessagingError, type VaultStatus } from '../../messaging/protocol';

type Phase =
  | { kind: 'loading' }
  | { kind: 'ready'; status: VaultStatus }
  | { kind: 'error'; message: string };

export default function App(): React.ReactElement {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const status = await popupClient.send({ kind: 'getStatus' });
      setPhase({ kind: 'ready', status });
    } catch (err) {
      setPhase({
        kind: 'error',
        message:
          err instanceof MessagingError
            ? err.message
            : 'Could not reach the service worker.',
      });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-lock awareness: if the SW's expiresAt elapses while the popup is
  // still open, refetch so the UI flips to "locked" instead of showing
  // stale unlocked state. (When the popup is closed, the next open() does a
  // fresh getStatus, which already covers the closed-popup case.)
  // `expiresAt: null` means auto-lock is disabled — skip the timer.
  useEffect(() => {
    if (phase.kind !== 'ready' || phase.status.state !== 'unlocked') return;
    if (phase.status.expiresAt === null) return;
    const ms = phase.status.expiresAt - Date.now();
    if (ms <= 0) {
      refresh();
      return;
    }
    const handle = window.setTimeout(refresh, ms);
    return () => window.clearTimeout(handle);
  }, [phase, refresh]);

  if (phase.kind === 'loading') return <Loading />;
  if (phase.kind === 'error')
    return <ErrorView message={phase.message} onRetry={refresh} />;

  switch (phase.status.state) {
    case 'uninitialized':
      return (
        <Onboarding
          onCreated={(status) => setPhase({ kind: 'ready', status })}
        />
      );
    case 'locked':
      return (
        <Unlock onUnlocked={(status) => setPhase({ kind: 'ready', status })} />
      );
    case 'unlocked':
      return <Vault onLocked={refresh} />;
  }
}

function Loading(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-muted-foreground text-xs">Loading…</div>
    </div>
  );
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="font-medium text-sm">Something went wrong</div>
      <p className="text-muted-foreground text-xs leading-relaxed">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
