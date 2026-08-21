'use client';
import { useActionState } from 'react';
import { cn } from '@/lib/utils';
import { useT } from '@/components/i18n-provider';
import { FormError } from '@/components/forms/form-error';
import type { ActionState } from '@/lib/actions/types';

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Thin wrapper around useActionState that renders a form and surfaces the
 * action's error/success message. Messages are localised at display time via the
 * i18n phrase map, so action code stays in plain English.
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: ServerAction;
  className?: string;
  children: React.ReactNode | ((state: ActionState) => React.ReactNode);
}) {
  const [state, formAction] = useActionState(action, null);
  const { m } = useT();
  return (
    <form action={formAction} className={cn('space-y-3', className)}>
      {typeof children === 'function' ? children(state) : children}
      <FormError error={state?.error} />
      {state?.ok && state.message && (
        <p className="rounded-md bg-success/10 px-3 py-1.5 text-sm text-success">
          {m(state.message)}
        </p>
      )}
    </form>
  );
}
