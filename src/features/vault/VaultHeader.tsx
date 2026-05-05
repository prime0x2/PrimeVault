import { Lock, Settings } from 'lucide-react';
import { browser } from 'wxt/browser';
import { Button } from '../../components/ui/button';

interface VaultHeaderProps {
  onLock: () => void;
  locking: boolean;
}

export function VaultHeader({
  onLock,
  locking,
}: VaultHeaderProps): React.ReactElement {
  function openSettings(): void {
    // openOptionsPage() is the canonical MV3 way to open the user's
    // configured options view; respects whether we declared options_page or
    // options_ui.embedded. Falls back gracefully if not yet supported.
    browser.runtime.openOptionsPage();
  }

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b px-3">
      <span className="font-semibold text-sm tracking-tight">PrimeVault</span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={openSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onLock}
          disabled={locking}
          aria-label="Lock vault"
          title="Lock vault"
        >
          <Lock className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
