import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A plain native select styled with theme tokens.
 *
 * The onboarding timezone picker holds ~400 options; a native select gets
 * type-ahead, virtualisation and mobile pickers for free, where the Radix
 * listbox would need a combobox and a virtualiser. ADR-021 says build for
 * function now and reskin later, so the simple control wins.
 */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<'select'>>(
  ({ className, children, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';
