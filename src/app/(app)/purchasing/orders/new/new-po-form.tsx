'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AttachmentField } from '@/components/purchasing/attachment-field';
import { useT } from '@/components/i18n-provider';
import { createDraftPurchaseOrder } from '@/lib/actions/purchasing';
import { CURRENCIES, type Currency } from '@/lib/domain/purchasing';
import type { ActionState } from '@/lib/actions/types';
import { NewSpecDialog, type NewSkuOption } from './new-spec-dialog';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface SupplierOpt {
  id: string;
  name: string;
  defaultCurrency: Currency;
}
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
  defaultUnit: string;
}

interface ItemRow {
  key: number;
  skuId: string;
  locationId: string;
  orderedQty: string;
  unitCost: string;
}

let nextKey = 1;
function emptyRow(): ItemRow {
  return { key: nextKey++, skuId: '', locationId: '', orderedQty: '', unitCost: '' };
}

export function NewPoForm({
  suppliers,
  locations,
  skuOptions,
  families,
  today,
}: {
  suppliers: SupplierOpt[];
  locations: LocationOpt[];
  skuOptions: SkuOpt[];
  families: FamilyOpt[];
  today: string;
}) {
  const { t, m } = useT();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createDraftPurchaseOrder,
    null,
  );
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [currency, setCurrency] = useState<Currency>(suppliers[0]?.defaultCurrency ?? 'USD');
  const [extraSkuOptions, setExtraSkuOptions] = useState<SkuOpt[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && state.data?.id) {
      router.push(`/purchasing/orders/${state.data.id}`);
    }
  }, [state, router]);

  // Specs added via "+ New specification" mid-form, merged with the catalog
  // fetched at page load — both selectable the same way in every row.
  const allSkuOptions = [...skuOptions, ...extraSkuOptions];
  const unitFor = (skuId: string) => allSkuOptions.find((s) => s.id === skuId)?.unit ?? '';

  function onSpecCreated(rowKey: number, sku: NewSkuOption) {
    setExtraSkuOptions((prev) => [...prev, sku]);
    updateItem(rowKey, { skuId: sku.id });
  }
  const lineTotal = (row: ItemRow) => {
    const qty = Number(row.orderedQty) || 0;
    const cost = Number(row.unitCost) || 0;
    return (qty * cost).toFixed(2);
  };

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valid = items.filter((r) => r.skuId && r.locationId && r.orderedQty && r.unitCost);
    if (valid.length === 0) return;
    const payload = valid.map((r) => ({
      skuId: r.skuId,
      locationId: r.locationId,
      orderedQty: Number(r.orderedQty),
      unitCost: Number(r.unitCost),
    }));
    const fd = new FormData(formRef.current!);
    fd.set('itemsJson', JSON.stringify(payload));
    formAction(fd);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pur.newPo')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="supplierId">{t('pur.supplier')}</Label>
            <select
              id="supplierId"
              name="supplierId"
              className={selectCls}
              required
              defaultValue=""
              onChange={(e) => {
                const sup = suppliers.find((s) => s.id === e.target.value);
                if (sup) setCurrency(sup.defaultCurrency);
              }}
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">{t('pur.currency')}</Label>
            <select
              id="currency"
              name="currency"
              className={selectCls}
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orderDate">{t('pur.orderDate')}</Label>
            <Input id="orderDate" name="orderDate" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedArrivalDate">{t('pur.expectedArrival')}</Label>
            <Input id="expectedArrivalDate" name="expectedArrivalDate" type="date" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Input id="notes" name="notes" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('pur.attachment')}</Label>
            <AttachmentField name="attachmentPath" label={t('pur.attachment')} folder="po" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pur.lineItems')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((row) => (
            <div key={row.key} className="grid grid-cols-12 items-end gap-2 rounded-md border p-3">
              <div className="col-span-12 space-y-1.5 sm:col-span-4">
                <Label>{t('inv.specification')}</Label>
                <select
                  className={selectCls}
                  data-testid="po-item-sku"
                  value={row.skuId}
                  onChange={(e) => updateItem(row.key, { skuId: e.target.value })}
                  required
                >
                  <option value="" disabled>
                    {t('common.select')}
                  </option>
                  {allSkuOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <NewSpecDialog
                  families={families}
                  onCreated={(sku) => onSpecCreated(row.key, sku)}
                />
              </div>
              <div className="col-span-6 space-y-1.5 sm:col-span-3">
                <Label>{t('common.location')}</Label>
                <select
                  className={selectCls}
                  data-testid="po-item-location"
                  value={row.locationId}
                  onChange={(e) => updateItem(row.key, { locationId: e.target.value })}
                  required
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
              <div className="col-span-6 space-y-1.5 sm:col-span-2">
                <Label>
                  {t('pur.orderedQty')} {row.skuId ? `(${unitFor(row.skuId)})` : ''}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  data-testid="po-item-qty"
                  value={row.orderedQty}
                  onChange={(e) => updateItem(row.key, { orderedQty: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-8 space-y-1.5 sm:col-span-2">
                <Label>{t('pur.unitCost')}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  data-testid="po-item-cost"
                  value={row.unitCost}
                  onChange={(e) => updateItem(row.key, { unitCost: e.target.value })}
                  required
                />
              </div>
              <div className="col-span-3 space-y-1.5 sm:col-span-1">
                <Label>{t('pur.lineTotal')}</Label>
                <p className="pt-2 text-sm tabular-nums">{lineTotal(row)}</p>
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={items.length === 1}
                  onClick={() => setItems((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, emptyRow()])}
          >
            {t('pur.addItem')}
          </Button>

          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(state.error)}
            </p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('pur.createDraft')}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
