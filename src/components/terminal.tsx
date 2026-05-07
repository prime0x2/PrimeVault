/*
 * Brand atoms shared by both directions.
 *
 * One file, no shadcn, no CVA — just the small set of primitives the
 * design uses repeatedly. Tailwind for layout, CSS vars (theme.css) for
 * color, inline SVG for marks and icons.
 *
 * BrandMark / BrandMarkLarge render both the Dial (Direction B) and the
 * Keyhole (Direction C) and let theme.css's `.terminal-only` /
 * `.calm-only` rules show the right one. Direct DialMark / KeyholeMark
 * exports remain available if a screen needs to force a specific mark.
 */

import * as React from 'react';
import { cn } from '../lib/cn';

// ───── Brand mark — small (header) ─────────────────────────────────────────

/**
 * Renders both the Dial (Direction B) and Keyhole (Direction C) marks;
 * `theme.css`'s `.terminal-only` / `.calm-only` rules show only the
 * active one.
 *
 * `className` is applied to *both* internal spans. Only one is ever
 * visible (`display: none` on the other), so practically only one
 * applies — but keep `className` to color/styling utilities, not layout
 * classes (`mr-3`, `w-fit`), or you'll get surprises if the visibility
 * model ever changes.
 */
export function BrandMark({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <>
      <span className={cn('terminal-only inline-flex', className)}>
        <DialMark size={size} />
      </span>
      <span className={cn('calm-only inline-flex', className)}>
        <KeyholeMark size={size} />
      </span>
    </>
  );
}

export function BrandMarkLarge({
  size = 84,
}: {
  size?: number;
}): React.ReactElement {
  return (
    <>
      <span className="terminal-only inline-flex">
        <DialMarkLarge size={size} />
      </span>
      <span className="calm-only inline-flex">
        <KeyholeMarkLarge size={size} />
      </span>
    </>
  );
}

// ───── Direction B — Dial mark ─────────────────────────────────────────────
export function DialMark({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle
        cx="14"
        cy="14"
        r="12"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.4"
      />
      <circle cx="14" cy="14" r="9" stroke="currentColor" strokeWidth="1.3" />
      <circle
        cx="14"
        cy="14"
        r="5.5"
        stroke="var(--accent)"
        strokeWidth="1.4"
      />
      <line
        x1="14"
        y1="2"
        x2="14"
        y2="5.5"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="14" cy="14" r="1.2" fill="var(--accent)" />
    </svg>
  );
}

// ───── Direction C — Keyhole mark (small) ──────────────────────────────────
export function KeyholeMark({
  size = 22,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle
        cx="14"
        cy="14"
        r="11.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="14" cy="12" r="2.2" fill="var(--accent)" />
      <path d="M13.3 13.5h1.4l-.4 4h-.6l-.4-4Z" fill="var(--accent)" />
    </svg>
  );
}

// ───── Direction C — Keyhole mark (large hero) ─────────────────────────────
export function KeyholeMarkLarge({
  size = 84,
}: {
  size?: number;
}): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
      <circle cx="40" cy="40" r="34" stroke="currentColor" strokeWidth="1.6" />
      <circle
        cx="40"
        cy="40"
        r="28"
        stroke="currentColor"
        strokeWidth="0.8"
        opacity="0.35"
      />
      <circle cx="40" cy="34" r="5.5" fill="var(--accent)" />
      <path d="M38.2 38h3.6l-1 11h-1.6l-1-11Z" fill="var(--accent)" />
    </svg>
  );
}

// ───── Direction B — Dial mark (large hero) ────────────────────────────────
export function DialMarkLarge({
  size = 84,
}: {
  size?: number;
}): React.ReactElement {
  const ticks = Array.from({ length: 36 }, (_, i) => i);
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden>
      {ticks.map((i) => {
        const a = (i / 36) * Math.PI * 2 - Math.PI / 2;
        const major = i % 9 === 0;
        const r1 = major ? 32 : 35;
        const r2 = 38;
        return (
          <line
            key={i}
            x1={40 + Math.cos(a) * r1}
            y1={40 + Math.sin(a) * r1}
            x2={40 + Math.cos(a) * r2}
            y2={40 + Math.sin(a) * r2}
            stroke="var(--border-strong)"
            strokeWidth={major ? 1.2 : 0.7}
            opacity={major ? 0.9 : 0.4}
          />
        );
      })}
      <circle
        cx="40"
        cy="40"
        r="29"
        stroke="var(--border-strong)"
        strokeWidth="1"
      />
      <circle cx="40" cy="40" r="20" stroke="var(--accent)" strokeWidth="1.4" />
      <circle
        cx="40"
        cy="40"
        r="11"
        stroke="var(--border-strong)"
        strokeWidth="0.8"
        opacity="0.5"
      />
      <line
        x1="40"
        y1="6"
        x2="40"
        y2="14"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="40" cy="40" r="2.5" fill="var(--accent)" />
    </svg>
  );
}

// ───── Status pill — `[• unlocked]` ────────────────────────────────────────
export function Pill({
  children,
  dot,
  className,
}: {
  children: React.ReactNode;
  dot?: string;
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border-default bg-bg-elev px-2 py-[3px] font-mono text-[10.5px] text-text-dim tracking-wider',
        className,
      )}
    >
      {dot !== undefined && (
        <span
          className="h-[5px] w-[5px] rounded-[3px]"
          style={{ background: dot }}
        />
      )}
      {children}
    </span>
  );
}

// ───── Keyboard hint — `⌘/` ────────────────────────────────────────────────
export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border-default bg-bg-elev px-[5px] font-mono text-[10px] text-text-dim',
        className,
      )}
    >
      {children}
    </span>
  );
}

// ───── Primary CTA — full-width, mint when active ──────────────────────────
type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const PrimaryButton = React.forwardRef<
  HTMLButtonElement,
  PrimaryButtonProps
>(({ className, disabled, children, ...rest }, ref) => (
  <button
    ref={ref}
    type={rest.type ?? 'button'}
    disabled={disabled}
    className={cn(
      'inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-[10px] font-sans font-semibold text-sm tracking-tight transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      disabled
        ? 'cursor-not-allowed border border-border-default bg-bg-elev text-text-dim'
        : 'bg-accent text-bg shadow-[0_4px_16px_-8px_var(--accent)] hover:brightness-105',
      className,
    )}
    {...rest}
  >
    {children}
  </button>
));
PrimaryButton.displayName = 'PrimaryButton';

// ───── Secondary / outline button ──────────────────────────────────────────
type GhostButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const GhostButton = React.forwardRef<
  HTMLButtonElement,
  GhostButtonProps
>(({ className, children, ...rest }, ref) => (
  <button
    ref={ref}
    type={rest.type ?? 'button'}
    className={cn(
      'inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-default px-3 font-sans font-medium text-[13px] text-text-dim transition-colors',
      'hover:border-border-strong hover:text-text disabled:cursor-not-allowed disabled:opacity-50',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      className,
    )}
    {...rest}
  >
    {children}
  </button>
));
GhostButton.displayName = 'GhostButton';

// ───── Danger button (delete confirm) ──────────────────────────────────────
type DangerButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const DangerButton = React.forwardRef<
  HTMLButtonElement,
  DangerButtonProps
>(({ className, children, ...rest }, ref) => (
  <button
    ref={ref}
    type={rest.type ?? 'button'}
    className={cn(
      'inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-transparent px-3 font-sans font-semibold text-[13px] text-white transition-colors',
      'bg-[var(--danger-strong)] shadow-[0_4px_16px_-8px_var(--danger-strong)] hover:brightness-110',
      'disabled:cursor-not-allowed disabled:opacity-60',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--danger)] focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
      className,
    )}
    {...rest}
  >
    {children}
  </button>
));
DangerButton.displayName = 'DangerButton';

// ───── Icon button (footer / header utility actions) ──────────────────────
type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={cn(
        'inline-flex h-[22px] w-[22px] items-center justify-center rounded text-text-dim transition-colors',
        'hover:bg-bg-elev hover:text-text disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';

// ───── Terminal-style input with $ prefix and blinking cursor on focus ────
type TerminalInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'prefix'
> & {
  /** Mono-spaced glyph rendered to the left of the input. Defaults to `$`. */
  prefix?: string;
  /** Letter-spacing widens for masked dots; opt-in. */
  spacedValue?: boolean;
};

export const TerminalInput = React.forwardRef<
  HTMLInputElement,
  TerminalInputProps
>(({ className, prefix = '$', spacedValue, onFocus, onBlur, ...rest }, ref) => {
  const [focused, setFocused] = React.useState(false);
  return (
    <div
      className={cn(
        'flex h-[46px] items-center rounded-[10px] border bg-bg-input px-[14px] transition-all',
        focused
          ? 'border-border-accent shadow-[0_0_0_4px_var(--accent-soft)]'
          : 'border-border-strong',
        className,
      )}
    >
      <span
        className="terminal-only mr-2.5 select-none font-mono text-[13px] text-accent"
        aria-hidden
      >
        {prefix}
      </span>
      <input
        ref={ref}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          'flex-1 border-0 bg-transparent font-mono text-[14px] text-text outline-none placeholder:text-text-muted',
          spacedValue && 'tracking-[0.15em]',
        )}
      />
    </div>
  );
});
TerminalInput.displayName = 'TerminalInput';

// ───── Footer icons (lock, settings) — small SVGs ──────────────────────────
export function LockIcon({ size = 13 }: { size?: number }): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SettingsIcon({
  size = 13,
}: {
  size?: number;
}): React.ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Zm5.5 1.8c0-.3 0-.6-.07-.9l1.27-.95-1.4-2.4-1.5.5a4.5 4.5 0 0 0-1.55-.9L9.9 1.5h-3.8l-.35 1.85a4.5 4.5 0 0 0-1.55.9l-1.5-.5-1.4 2.4 1.27.95a4.5 4.5 0 0 0 0 1.8L1.3 9.85l1.4 2.4 1.5-.5c.45.4.97.7 1.55.9L6.1 14.5h3.8l.35-1.85a4.5 4.5 0 0 0 1.55-.9l1.5.5 1.4-2.4-1.27-.95c.05-.3.07-.6.07-.9Z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ───── Popup shell — radial wash + flex column ─────────────────────────────
export function PopupShell({
  header,
  footer,
  children,
  className,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('relative flex h-full flex-1 flex-col', className)}>
      {/* dusky violet wash at top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[200px]"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, var(--accent-soft), transparent 60%)',
        }}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {header}
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
        {footer}
      </div>
    </div>
  );
}

// ───── Brand header — BrandMark + name + optional status pill ─────────────
export function BrandHeader({
  status,
  statusColor,
}: {
  status?: string;
  statusColor?: string;
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center justify-between px-[18px] py-3.5">
      <div className="flex items-center gap-2.5">
        <BrandMark size={22} className="text-text" />
        <span className="font-semibold text-[14px] text-text tracking-tight">
          PrimeVault
        </span>
      </div>
      {status !== undefined && (
        <Pill dot={statusColor ?? 'var(--accent)'}>{status}</Pill>
      )}
    </div>
  );
}

// ───── Footer (status text + lock/settings) ───────────────────────────────
export function PopupFooter({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center justify-between border-t border-border-default px-[18px] py-2.5 font-mono text-[10.5px] text-text-muted">
      {children}
    </div>
  );
}
