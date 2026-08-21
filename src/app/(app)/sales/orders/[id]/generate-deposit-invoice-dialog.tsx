'use client';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
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
import { FormError } from '@/components/forms/form-error';
import { generateDepositInvoice } from '@/lib/actions/deposit-invoices';
import {
  DEPOSIT_PERCENTAGE_PRESETS,
  computeDepositAmount,
  computeRemainingBalance,
} from '@/lib/domain/deposit-invoice';
import type { ActionState } from '@/lib/actions/types';

/** Percentage-of-order deposit invoice, generated off a confirmed sales order. */
export function GenerateDepositInvoiceDialog({
  soId,
  grandTotal,
  currency,
  onGenerated,
}: {
  soId: string;
  grandTotal: number;
  currency: string;
  onGenerated: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [percentage, setPercentage] = useState<number>(DEPOSIT_PERCENTAGE_PRESETS[0]);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    generateDepositInvoice,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      onGenerated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const depositAmount = computeDepositAmount(grandTotal, percentage || 0);
  const remainingBalance = computeRemainingBalance(grandTotal, depositAmount);
  const money = (n: number) => `${currency} ${n.toFixed(2)}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Receipt className="h-4 w-4" /> {t('sal.generateDepositInvoice')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sal.generateDepositInvoice')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="salesOrderId" value={soId} />
          <div className="space-y-1.5">
            <Label htmlFor="gdi-pct">{t('sal.depositPercentage')}</Label>
            <div className="flex gap-2">
              {DEPOSIT_PERCENTAGE_PRESETS.map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={percentage === p ? 'default' : 'outline'}
                  onClick={() => setPercentage(p)}
                >
                  {p}%
                </Button>
              ))}
            </div>
            <Input
              id="gdi-pct"
              name="depositPercentage"
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={percentage}
              onChange={(e) => setPercentage(Number(e.target.value))}
              required
            />
          </div>
          <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('sal.totalOrderAmount')}</span>
              <span className="tabular-nums">{money(grandTotal)}</span>
            </div>
            <div className="flex justify-between font-medium">
              <span>{t('sal.depositAmount')}</span>
              <span className="tabular-nums">{money(depositAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('sal.remainingBalance')}</span>
              <span className="tabular-nums">{money(remainingBalance)}</span>
            </div>
          </div>
          <FormError error={state?.error} />
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('sal.generateDepositInvoice')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
