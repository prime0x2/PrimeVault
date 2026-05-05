import { AppearanceSection } from './AppearanceSection';
import { BackupSection } from './BackupSection';
import { SecuritySection } from './SecuritySection';
import { usePrefs } from './usePrefs';

export function Options(): React.ReactElement {
  const { state, update } = usePrefs();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-xl tracking-tight">
          PrimeVault Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Preferences are stored locally and never leave this device.
        </p>
      </header>

      {state.kind === 'loading' ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          <SecuritySection prefs={state.prefs} onChange={update} />
          <AppearanceSection prefs={state.prefs} onChange={update} />
          <BackupSection />
          <AboutSection />
        </>
      )}
    </div>
  );
}

function AboutSection(): React.ReactElement {
  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <h2 className="font-semibold text-base tracking-tight">About</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        PrimeVault is open source, MIT-licensed, and zero-knowledge. Your master
        password never leaves this device, and there is no sync server.
      </p>
    </section>
  );
}
