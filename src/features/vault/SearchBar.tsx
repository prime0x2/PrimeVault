import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
  count: number;
  total: number;
  /** Focus the input on mount. */
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

  const filtered = value.trim() !== '';
  const display = filtered ? `${count} / ${total}` : `${total}`;

  return (
    <div className="px-3.5 pt-2 pb-3">
      <div
        className={cn(
          'flex h-10.5 items-center rounded-[10px] border bg-bg-elev px-3 transition-all',
          filtered
            ? 'border-border-accent shadow-[0_0_0_4px_var(--accent-soft)]'
            : 'border-border-strong',
        )}
      >
        <span
          className="terminal-only mr-2.5 select-none font-mono text-[14px] text-accent"
          aria-hidden
        >
          ›
        </span>
        <svg
          className="calm-only mr-2.5 shrink-0 text-text-muted"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden
        >
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M9 9l3 3"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="search secrets…"
          aria-label="Search entries"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 border-0 bg-transparent font-mono text-[13px] text-text outline-none placeholder:text-text-muted"
        />
        {value !== '' && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            title="Clear (Esc)"
            className="inline-flex h-4.5 w-4.5 items-center justify-center rounded text-text-dim hover:text-text"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M2 2l7 7M9 2l-7 7"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <span
          role="status"
          aria-label="Result count"
          className="ml-2 select-none font-mono text-[10px] text-text-muted tabular-nums"
        >
          {display}
        </span>
      </div>
    </div>
  );
}
