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
import { addPurchaseOrderItem } from '@/lib/actions/purchasing';
import { NewSpecDialog } from '@/components/purchasing/new-spec-dialog';
import type { ActionState } from '@/lib/actions/types';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface LocationOpt {
  id: string;
  name: string;
}
interface SkuOpt {
  id: string;
  unit: string;
  label: string;
}
interface FamilyOpt {
  id: string;
  name: string;
  nameEnglish: string | null;
}

/** Add one line item to a Draft purchase order — mirrors AddSoItemDialog. */
export function AddPoItemDialog({
  purchaseOrderId,
  locations,
  skuOptions: initialSkuOptions,
  families,
  canCreateSpec,
  onAdded,
}: {
  purchaseOrderId: string;
  locations: LocationOpt[];
  skuOptions: SkuOpt[];
  families: FamilyOpt[];
  canCreateSpec: boolean;
  onAdded: () => void;
}) {
  const { t, m } = useT();
  const [open, setOpen] = useState(false);
  const [skuId, setSkuId] = useState('');
  const [skuOptions, setSkuOptions] = useState<SkuOpt[]>(initialSkuOptions);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addPurchaseOrderItem,
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
          <Plus className="h-4 w-4" /> {t('pur.addItem')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pur.addItem')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="api-sku">{t('inv.specification')}</Label>
              {canCreateSpec && (
                <NewSpecDialog
                  families={families}
                  onCreated={(sku) => {
                    setSkuOptions((prev) => [...prev, sku]);
                    setSkuId(sku.id);
                  }}
                />
              )}
            </div>
            <select
              id="api-sku"
              name="skuId"
              className={selectCls}
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
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-location">{t('common.location')}</Label>
            <select
              id="api-location"
              name="locationId"
              className={selectCls}
              required
              defaultValue=""
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="api-qty">
                {t('pur.orderedQty')} {unit ? `(${unit})` : ''}
              </Label>
              <Input
                id="api-qty"
                name="orderedQty"
                type="number"
                step="0.001"
                min="0.001"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="api-cost">{t('pur.unitCost')}</Label>
              <Input id="api-cost" name="unitCost" type="number" step="0.0001" min="0" required />
            </div>
          </div>
          {state?.error && <p className="text-sm text-destructive">{m(state.error)}</p>}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('pur.addItem')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
