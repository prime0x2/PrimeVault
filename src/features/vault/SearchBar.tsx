import { Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Input } from '../../components/ui/input';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  count: number;
  total: number;
  /** Focus the input on mount. Used when route enters the vault screen. */
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChange,
  count,
  total,
  autoFocus,
}: SearchBarProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape' && value !== '') {
      e.preventDefault();
      onChange('');
    }
  }

  // When filtering, show "n / total"; otherwise just the total.
  const filtered = value.trim() !== '';
  const display = filtered ? `${count} / ${total}` : `${total}`;

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
      <Search
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Search by name or tag…"
        aria-label="Search entries"
        className="h-7 flex-1 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
      />
      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          title="Clear (Esc)"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <span
        role="status"
        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums"
      >
        {display}
      </span>
    </div>
  );
}
