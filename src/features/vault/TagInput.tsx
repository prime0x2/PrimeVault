import { X } from 'lucide-react';
import { useState } from 'react';
import { Input } from '../../components/ui/input';
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
        'flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm',
        'focus-within:ring-2 focus-within:ring-ring',
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-muted-foreground text-xs"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            aria-label={`Remove tag ${tag}`}
            className="rounded-full text-muted-foreground/70 hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder={
          atCap ? `Max ${MAX_TAGS} tags` : value.length === 0 ? 'Add tags…' : ''
        }
        disabled={atCap}
        aria-label={ariaLabel ?? 'Add a tag'}
        maxLength={24}
        className="h-6 min-w-20 flex-1 border-0 bg-transparent px-1 py-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
