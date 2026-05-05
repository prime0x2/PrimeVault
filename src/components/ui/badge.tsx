import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] leading-none transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-input text-foreground',
        warning:
          'border-transparent bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
        destructive: 'border-transparent bg-destructive/15 text-destructive',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({
  className,
  variant,
  ...props
}: BadgeProps): React.ReactElement {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
