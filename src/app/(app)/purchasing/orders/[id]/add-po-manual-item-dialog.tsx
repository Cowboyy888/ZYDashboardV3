'use client';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import { addPurchaseOrderManualItem } from '@/lib/actions/purchasing';
import type { ActionState } from '@/lib/actions/types';

/**
 * Add a free-text product line to a Draft-or-otherwise purchase order — no
 * SKU/location pick, no connection to the product/family catalog at all.
 * Not nested inside another form (po-detail.tsx has none), so the normal
 * `<form action={...}>` + useActionState wiring is safe here.
 */
export function AddPoManualItemDialog({
  purchaseOrderId,
  onAdded,
}: {
  purchaseOrderId: string;
  onAdded: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addPurchaseOrderManualItem,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      onAdded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="h-4 w-4" /> {t('pur.addProduct')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pur.addProduct')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <div className="space-y-1.5">
            <Label htmlFor="pmi-name">{t('pur.productName')}</Label>
            <Input id="pmi-name" name="productName" required autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pmi-qty">{t('pur.orderedQty')}</Label>
              <Input id="pmi-qty" name="quantity" type="number" step="0.001" min="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pmi-unit">{t('common.unit')}</Label>
              <Input id="pmi-unit" name="unit" placeholder="张 / 捆" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pmi-price">{t('pur.unitCost')}</Label>
              <Input id="pmi-price" name="unitPrice" type="number" step="0.0001" min="0" />
            </div>
          </div>
          <FormError error={state?.error} />
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('pur.addProduct')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
