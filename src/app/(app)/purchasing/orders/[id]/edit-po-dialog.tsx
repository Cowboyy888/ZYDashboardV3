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
import { updatePurchaseOrderHeader } from '@/lib/actions/purchasing';
import { CURRENCIES, type Currency } from '@/lib/domain/purchasing';
import type { ActionState } from '@/lib/actions/types';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface SupplierOpt {
  id: string;
  name: string;
}

/**
 * Draft-only: correct a PO's supplier/currency/order date/notes (DB allows
 * this while status = 'draft'). `suppliers` must include archived ones too
 * (fetched via getSuppliers(true)) so the PO's current supplier always has a
 * matching <option> — otherwise the select would silently fall back to a
 * different supplier if the assigned one had since been archived.
 */
export function EditPoDialog({
  poId,
  supplierId,
  currency,
  orderDate,
  notes,
  suppliers,
  onSaved,
}: {
  poId: string;
  supplierId: string;
  currency: Currency;
  orderDate: string;
  notes: string | null;
  suppliers: SupplierOpt[];
  onSaved: () => void;
}) {
  const { t, m } = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updatePurchaseOrderHeader,
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
          <Pencil className="h-4 w-4" /> {t('common.edit')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pur.editPo')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={poId} />
          <div className="space-y-1.5">
            <Label htmlFor="ep-supplier">{t('pur.supplier')}</Label>
            <select
              id="ep-supplier"
              name="supplierId"
              className={selectCls}
              defaultValue={supplierId}
              required
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-currency">{t('pur.currency')}</Label>
              <select
                id="ep-currency"
                name="currency"
                className={selectCls}
                defaultValue={currency}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-date">{t('pur.orderDate')}</Label>
              <Input id="ep-date" name="orderDate" type="date" defaultValue={orderDate} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-notes">{t('common.notes')}</Label>
            <Input id="ep-notes" name="notes" defaultValue={notes ?? ''} />
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
