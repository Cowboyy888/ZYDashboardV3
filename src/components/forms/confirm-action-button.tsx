'use client';
import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import type { ActionState } from '@/lib/actions/types';

/** A button that asks for confirmation, then calls a server action directly (no form). */
export function ConfirmActionButton({
  action,
  formData,
  label,
  confirmText,
  variant = 'outline',
  onSuccess,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  formData: Record<string, string>;
  label: string;
  confirmText: string;
  variant?: 'outline' | 'destructive' | 'default' | 'ghost';
  onSuccess?: () => void;
}) {
  const { m } = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(confirmText)) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(formData)) fd.set(k, v);
      const res = await action(null, fd);
      if (res?.ok) onSuccess?.();
      else setError(res?.error ?? 'Failed');
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant={variant} size="sm" disabled={pending} onClick={onClick}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {label}
      </Button>
      {error && <span className="text-xs text-destructive">{m(error)}</span>}
    </div>
  );
}
