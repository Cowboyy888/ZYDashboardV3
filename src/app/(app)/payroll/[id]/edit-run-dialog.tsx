'use client';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useT } from '@/components/i18n-provider';
import { updatePayrollRunDates } from '@/lib/actions/payroll';
import type { ActionState } from '@/lib/actions/types';

/** Draft-only: correct a run's period/pay dates or notes (DB allows this while status = 'draft'). */
export function EditRunDialog({
  runId,
  periodStart,
  periodEnd,
  payDate,
  notes,
  onSaved,
}: {
  runId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  notes: string | null;
  onSaved: () => void;
}) {
  const { t, m } = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updatePayrollRunDates,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      onSaved();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Pencil className="h-4 w-4" /> {t('pay.editDates')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pay.editDates')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={runId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="er-start">{t('pay.periodStart')}</Label>
              <Input
                id="er-start"
                name="periodStart"
                type="date"
                defaultValue={periodStart}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="er-end">{t('pay.periodEnd')}</Label>
              <Input id="er-end" name="periodEnd" type="date" defaultValue={periodEnd} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="er-pay">{t('pay.payDate')}</Label>
              <Input id="er-pay" name="payDate" type="date" defaultValue={payDate} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="er-notes">{t('common.notes')}</Label>
            <Input id="er-notes" name="notes" defaultValue={notes ?? ''} />
          </div>
          {state?.error && <p className="text-sm text-destructive">{m(state.error)}</p>}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
