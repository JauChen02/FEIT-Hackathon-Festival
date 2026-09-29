'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A plain native checkbox styled with theme tokens.
 *
 * shadcn's Radix checkbox renders a button with `role="checkbox"`, which needs
 * a hidden input to participate in form validation and is awkward to drive from
 * Playwright. A native input is simpler, accessible by default, and equally
 * easy to reskin (ADR-021).
 */
export const Checkbox = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-4 w-4 shrink-0 rounded-sm border border-input accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';
