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
    <section className="flex flex-col gap-4 border-t pt-6">
      <h2 className="font-semibold text-base tracking-tight">Appearance</h2>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">Theme</legend>
        <div className="flex gap-2">
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
        <p className="text-muted-foreground text-xs leading-relaxed">
          "System" follows your OS appearance setting. Manual overrides take
          effect immediately on the popup and this page.
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
  // Hidden radio + styled label: gets us native radio-group keyboard
  // semantics (arrow keys, single-tab-stop) for free, while letting the
  // label own the visual styling. `peer` Tailwind classes target sibling
  // states so we can swap the label appearance based on `:checked`.
  return (
    <label
      className={cn(
        'cursor-pointer rounded-md border px-3 py-1.5 text-sm capitalize shadow-sm transition-colors',
        'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
        selected
          ? 'border-foreground bg-foreground text-background'
          : 'border-input bg-background hover:bg-muted',
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
