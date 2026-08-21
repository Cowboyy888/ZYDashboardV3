'use client';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useT } from '@/components/i18n-provider';
import { FormError } from '@/components/forms/form-error';
import { updatePurchaseOrderHeader } from '@/lib/actions/purchasing';
import { CURRENCIES, type Currency } from '@/lib/domain/purchasing';
import type { ActionState } from '@/lib/actions/types';

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
  const { t } = useT();
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
            <NativeSelect id="ep-supplier" name="supplierId" defaultValue={supplierId} required>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-currency">{t('pur.currency')}</Label>
              <NativeSelect id="ep-currency" name="currency" defaultValue={currency}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
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
          <FormError error={state?.error} />
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
