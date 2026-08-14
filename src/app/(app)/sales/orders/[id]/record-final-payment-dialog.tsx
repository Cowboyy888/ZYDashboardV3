'use client';
import { useActionState, useEffect, useState } from 'react';
import { CircleDollarSign, Loader2 } from 'lucide-react';
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
import { recordFinalPayment } from '@/lib/actions/payment-receipts';
import type { ActionState } from '@/lib/actions/types';

/** Logs a Final-payment-tagged receipt against the SO's remaining balance. */
export function RecordFinalPaymentDialog({
  depositInvoiceId,
  balanceDue,
  currency,
  today,
  onRecorded,
}: {
  depositInvoiceId: string;
  balanceDue: number;
  currency: string;
  today: string;
  onRecorded: () => void;
}) {
  const { t, m } = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    recordFinalPayment,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      onRecorded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <CircleDollarSign className="h-4 w-4" /> {t('sal.recordFinalPayment')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('sal.recordFinalPayment')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="depositInvoiceId" value={depositInvoiceId} />
          <div className="rounded-md border bg-muted/30 p-2 text-sm">
            <span className="text-muted-foreground">{t('sal.balanceDue')}: </span>
            <span className="font-medium tabular-nums">
              {currency} {balanceDue.toFixed(2)}
            </span>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-amount">{t('sal.paymentAmount')}</Label>
            <Input
              id="rfp-amount"
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={balanceDue}
              defaultValue={balanceDue.toFixed(2)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-date">{t('sal.paymentDate')}</Label>
            <Input id="rfp-date" name="paidDate" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-method">{t('sal.paymentMethod')}</Label>
            <Input id="rfp-method" name="method" placeholder={t('sal.paymentMethodPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rfp-notes">{t('common.notes')}</Label>
            <Input id="rfp-notes" name="notes" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{m(state.error)}</p>}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('sal.recordFinalPayment')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
