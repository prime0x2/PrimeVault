import { BrandMark } from '../../components/terminal';
import { AppearanceSection } from './AppearanceSection';
import { BackupSection } from './BackupSection';
import { SecuritySection } from './SecuritySection';
import { usePrefs } from './usePrefs';

export function Options(): React.ReactElement {
  const { state, update } = usePrefs();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10 text-text">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <BrandMark size={28} className="text-text" />
          <span className="font-mono text-[11px] text-text-muted tracking-[0.18em]">
            PRIMEVAULT · SETTINGS
          </span>
        </div>
        <h1 className="font-semibold text-2xl tracking-[-0.02em]">
          Preferences
        </h1>
        <p className="font-mono text-[12px] text-text-dim leading-relaxed">
          <span className="terminal-only" style={{ color: 'var(--accent)' }}>
            ›{' '}
          </span>
          stored locally — never leaves this device
        </p>
      </header>

      {state.kind === 'loading' ? (
        <div className="font-mono text-[12px] text-text-muted">loading…</div>
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
    <section className="flex flex-col gap-3 border-t border-border-default pt-6">
      <SectionTitle>About</SectionTitle>
      <p className="text-[13px] text-text-dim leading-relaxed">
        PrimeVault is open source, MIT-licensed, and zero-knowledge. Your master
        password never leaves this device, and there is no sync server.
      </p>
    </section>
  );
}

function SectionTitle({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <h2 className="font-mono text-[10.5px] text-text-muted tracking-[0.18em] uppercase">
      {children}
    </h2>
  );
}
