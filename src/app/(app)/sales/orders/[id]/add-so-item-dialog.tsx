'use client';
import { useActionState, useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
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
import { addSalesOrderItem } from '@/lib/actions/sales';
import type { ActionState } from '@/lib/actions/types';

interface LocationOpt {
  id: string;
  name: string;
}
interface SkuOpt {
  id: string;
  unit: string;
  label: string;
}

/**
 * Add one real line item (SKU + warehouse) to a Draft sales order — the
 * completion step for an order auto-created header-only from a paid
 * Quotation deposit (quotation lines are free text, so nothing can pick the
 * matching catalog SKU automatically; see so-detail.tsx's quotation
 * reference panel for what the human is copying quantity/price from).
 */
export function AddSoItemDialog({
  salesOrderId,
  locations,
  skuOptions,
  onAdded,
}: {
  salesOrderId: string;
  locations: LocationOpt[];
  skuOptions: SkuOpt[];
  onAdded: () => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [skuId, setSkuId] = useState('');
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addSalesOrderItem,
    null,
  );

  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setSkuId('');
      onAdded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const unit = skuOptions.find((s) => s.id === skuId)?.unit ?? '';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="h-4 w-4" /> {t('sal.addItem')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sal.addItem')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="salesOrderId" value={salesOrderId} />
          <div className="space-y-1.5">
            <Label htmlFor="asi-sku">{t('inv.specification')}</Label>
            <NativeSelect
              id="asi-sku"
              name="skuId"
              value={skuId}
              onChange={(e) => setSkuId(e.target.value)}
              required
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {skuOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="asi-location">{t('common.location')}</Label>
            <NativeSelect id="asi-location" name="locationId" required defaultValue="">
              <option value="" disabled>
                {t('common.select')}
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="asi-qty">
                {t('sal.orderedQty')} {unit ? `(${unit})` : ''}
              </Label>
              <Input
                id="asi-qty"
                name="orderedQty"
                type="number"
                step="0.001"
                min="0.001"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asi-price">{t('sal.unitPrice')}</Label>
              <Input id="asi-price" name="unitPrice" type="number" step="0.0001" min="0" required />
            </div>
          </div>
          <FormError error={state?.error} />
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('sal.addItem')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
