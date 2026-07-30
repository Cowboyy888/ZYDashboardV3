'use client';
import { useState, useTransition } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ActionState } from '@/lib/actions/types';

/** Calls an Admin-only "Send now" server action and shows the result inline. */
export function SendNowButton({
  action,
  label,
  confirmText,
}: {
  action: () => Promise<ActionState>;
  label: string;
  confirmText: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function onClick() {
    if (!window.confirm(confirmText)) return;
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await action();
      if (r?.ok) setMsg(r.message ?? 'Sent');
      else setErr(r?.error ?? 'Failed');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onClick}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {label}
      </Button>
      {msg && <span className="text-xs text-success">{msg}</span>}
      {err && <span className="text-xs text-destructive">{err}</span>}
    </div>
  );
}
