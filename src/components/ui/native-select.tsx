import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * A plain HTML <select>, styled to match Input/Button — this app's option
 * pickers (currency, role, status, SKU, location, etc.) use native <select>
 * throughout rather than the Radix Select in this folder, so this is the
 * shared style for that, not a Radix wrapper. Was copy-pasted as a local
 * `selectCls` string in 17 files (one had already drifted to a different
 * height/width); pass className to override for a compact inline instance
 * (e.g. editing a row's value directly in a table cell) the same way Input
 * callers already do.
 */
const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    className={cn(
      'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    ref={ref}
    {...props}
  />
));
NativeSelect.displayName = 'NativeSelect';

export { NativeSelect };
