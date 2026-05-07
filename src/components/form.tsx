/*
 * Form primitives styled for the Terminal direction. Used by the options
 * surface (Settings) where shadcn's API surface (Button/Input/Label/Select/
 * Textarea) is convenient. The popup sticks to atoms in `./terminal.tsx`.
 *
 * No CVA, no Radix — just native elements with Tailwind classes that read
 * the Terminal CSS vars from `styles/theme.css`.
 */

import * as React from 'react';
import { cn } from '../lib/cn';

// ───── Button — variants: default | outline | ghost | destructive ─────────

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  default:
    'bg-accent text-bg shadow-[0_4px_16px_-8px_var(--accent)] hover:brightness-110',
  outline:
    'border border-border-strong bg-transparent text-text hover:bg-bg-elev',
  ghost: 'bg-transparent text-text-dim hover:bg-bg-elev hover:text-text',
  destructive:
    'bg-[var(--danger-strong)] text-white shadow-[0_4px_16px_-8px_var(--danger-strong)] hover:brightness-110',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-[12.5px]',
  lg: 'h-10 px-8 text-sm',
  icon: 'h-9 w-9',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = 'default', size = 'default', type, ...rest },
    ref,
  ) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-sans font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    />
  ),
);
Button.displayName = 'Button';

// ───── Input ─────────────────────────────────────────────────────────────

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...rest }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-10 w-full rounded-[10px] border border-border-default bg-bg-input px-3 font-mono text-[13px] text-text outline-none transition-colors',
        'placeholder:text-text-muted',
        'focus:border-border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';

// ───── Label ─────────────────────────────────────────────────────────────

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...rest }, ref) => (
    // biome-ignore lint/a11y/noLabelWithoutControl: caller wires htmlFor
    <label
      ref={ref}
      className={cn(
        'font-sans font-medium text-[13px] text-text leading-none',
        className,
      )}
      {...rest}
    />
  ),
);
Label.displayName = 'Label';

// ───── Select (native) ──────────────────────────────────────────────────

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...rest }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-[10px] border border-border-default bg-bg-input px-3 font-mono text-[13px] text-text outline-none transition-colors',
        'focus:border-border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

// ───── Inline alert — danger / warn / success variants ──────────────────
//
// Used by the options forms for inline error / confirmation / success
// messages. Tokens come from theme.css so the colors swap with theme.

type AlertTone = 'danger' | 'warn' | 'success';

const ALERT_TONE: Record<AlertTone, string> = {
  danger: 'border-danger-border bg-danger-soft text-danger',
  warn: 'border-warn-border bg-warn-soft text-warn',
  // The success tone reuses the accent (mint in dark, ember in light).
  success: 'border-border-accent bg-accent-soft text-accent',
};

export interface AlertProps extends React.HTMLAttributes<HTMLParagraphElement> {
  tone?: AlertTone;
}

export const Alert = React.forwardRef<HTMLParagraphElement, AlertProps>(
  ({ className, tone = 'danger', children, ...rest }, ref) => (
    <p
      ref={ref}
      className={cn(
        'rounded-md border px-3 py-2 text-xs leading-relaxed',
        ALERT_TONE[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </p>
  ),
);
Alert.displayName = 'Alert';

// ───── Textarea ─────────────────────────────────────────────────────────

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-16 w-full resize-y rounded-[10px] border border-border-default bg-bg-input px-3 py-2 font-mono text-[12.5px] text-text outline-none transition-colors',
        'placeholder:text-text-muted',
        'focus:border-border-accent focus:shadow-[0_0_0_4px_var(--accent-soft)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';
