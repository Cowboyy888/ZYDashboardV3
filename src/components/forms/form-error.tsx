'use client';
import { cn } from '@/lib/utils';
import { useT } from '@/components/i18n-provider';

/**
 * Standard error-banner style, for the manual useActionState forms that
 * don't go through ActionForm (which already renders this exact style
 * internally). Was three drifted variants (two paddings, plus a bare
 * unstyled <p> with no background at all) copy-pasted across ~20 files.
 * className merges in for the handful of callers that need e.g. a grid
 * column span alongside the base style.
 */
export function FormError({ error, className }: { error?: string | null; className?: string }) {
  const { m } = useT();
  if (!error) return null;
  return (
    <p
      className={cn('rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive', className)}
    >
      {m(error)}
    </p>
  );
}
