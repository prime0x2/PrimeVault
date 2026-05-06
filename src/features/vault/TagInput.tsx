import { useState } from 'react';
import { cn } from '../../lib/cn';
import { MAX_TAGS, normalizeTag } from '../../lib/tags';

interface TagInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  ariaLabel?: string;
}

export function TagInput({
  value,
  onChange,
  ariaLabel,
}: TagInputProps): React.ReactElement {
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
  const atCap = value.length >= MAX_TAGS;

  function commit(): void {
    const tag = normalizeTag(draft);
    if (tag === '' || value.includes(tag) || atCap) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  }

  function remove(tag: string): void {
    onChange(value.filter((t) => t !== tag));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
      return;
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1.5 rounded-[10px] border bg-bg-input px-2 py-1.5 transition-all',
        focused
          ? 'border-border-accent shadow-[0_0_0_4px_var(--accent-soft)]'
          : 'border-border-default',
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-[5px] border border-border-default bg-bg-elev px-2 py-0.5 font-mono text-[11px] text-text"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`Remove tag ${tag}`}
            className="rounded text-text-muted hover:text-text"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path
                d="M2 2l5 5M7 2l-5 5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        placeholder={
          atCap
            ? `max ${MAX_TAGS} tags`
            : value.length === 0
              ? 'add tag'
              : '+ add tag'
        }
        disabled={atCap}
        aria-label={ariaLabel ?? 'Add a tag'}
        maxLength={24}
        autoComplete="off"
        spellCheck={false}
        className="min-w-20 flex-1 border-0 bg-transparent px-1 py-0.5 font-mono text-[11px] text-text outline-none placeholder:text-text-muted"
      />
    </div>
  );
}
