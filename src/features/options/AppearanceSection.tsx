import { cn } from '../../lib/cn';
import { type Prefs, THEME_OPTIONS, type Theme } from '../../storage/prefs';

interface AppearanceSectionProps {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => Promise<void>;
}

export function AppearanceSection({
  prefs,
  onChange,
}: AppearanceSectionProps): React.ReactElement {
  return (
    <section className="flex flex-col gap-4 border-t border-border-default pt-6">
      <h2 className="font-mono text-[10.5px] text-text-muted tracking-[0.18em] uppercase">
        Appearance
      </h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium text-[13px] text-text">Theme</legend>
        <div className="flex gap-2 mt-2">
          {THEME_OPTIONS.map((t) => (
            <ThemePill
              key={t}
              value={t}
              selected={prefs.theme === t}
              onSelect={(next) => {
                void onChange({ theme: next });
              }}
            />
          ))}
        </div>
        <p className="font-mono text-[11px] text-text-muted leading-relaxed">
          Direction B (Terminal) is dark-only for v0.1 — light and system both
          render the same dark surface. A native light theme will land with
          v0.2.
        </p>
      </fieldset>
    </section>
  );
}

interface ThemePillProps {
  value: Theme;
  selected: boolean;
  onSelect: (theme: Theme) => void;
}

function ThemePill({
  value,
  selected,
  onSelect,
}: ThemePillProps): React.ReactElement {
  return (
    <label
      className={cn(
        'cursor-pointer rounded-[8px] border px-3 py-1.5 font-mono text-[12px] capitalize transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
        selected
          ? 'border-border-accent bg-accent-soft text-text'
          : 'border-border-default bg-transparent text-text-dim hover:border-border-strong hover:text-text',
      )}
    >
      <input
        type="radio"
        name="theme"
        value={value}
        checked={selected}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      {value}
    </label>
  );
}
