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
import { recordDepositPayment } from '@/lib/actions/deposit-invoices';
import type { ActionState } from '@/lib/actions/types';

/** Logs a payment received against a deposit invoice (amount + date), an append-only ledger entry. */
export function RecordPaymentDialog({
  depositInvoiceId,
  today,
  onRecorded,
}: {
  depositInvoiceId: string;
  today: string;
  onRecorded: () => void;
}) {
  const { t, m } = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    recordDepositPayment,
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
          <CircleDollarSign className="h-4 w-4" /> {t('sal.recordPayment')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('sal.recordPayment')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="depositInvoiceId" value={depositInvoiceId} />
          <div className="space-y-1.5">
            <Label htmlFor="rp-amount">{t('sal.paymentAmount')}</Label>
            <Input id="rp-amount" name="amount" type="number" step="0.01" min="0.01" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-date">{t('sal.paymentDate')}</Label>
            <Input id="rp-date" name="paidDate" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-method">{t('sal.paymentMethod')}</Label>
            <Input id="rp-method" name="method" placeholder={t('sal.paymentMethodPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-notes">{t('common.notes')}</Label>
            <Input id="rp-notes" name="notes" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{m(state.error)}</p>}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('sal.recordPayment')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
