'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { AttachmentField } from '@/components/purchasing/attachment-field';
import { useT } from '@/components/i18n-provider';
import { createDraftSalesOrder } from '@/lib/actions/sales';
import { CURRENCIES, type Currency } from '@/lib/domain/sales';
import { computeUnitPriceFromArea, computeOrderedQtyFromArea } from '@/lib/domain/deposit-invoice';
import type { ActionState } from '@/lib/actions/types';

interface CustomerOpt {
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

interface ItemRow {
  key: number;
  skuId: string;
  locationId: string;
  orderedQty: string;
  unitPrice: string;
  // Optional per-m² pricing breakdown — when both are set, unitPrice is
  // computed from them (Price/m² × Area/sheet = Price/sheet) and read-only.
  areaPerSheet: string;
  pricePerSqm: string;
  // Optional total-area entry — when set together with areaPerSheet,
  // orderedQty is computed from them (Total area ÷ Area/sheet) and read-only.
  totalArea: string;
}

let nextKey = 1;
function emptyRow(): ItemRow {
  return {
    key: nextKey++,
    skuId: '',
    locationId: '',
    orderedQty: '',
    unitPrice: '',
    areaPerSheet: '',
    pricePerSqm: '',
    totalArea: '',
  };
}

export function NewSoForm({
  customers,
  locations,
  skuOptions,
  today,
}: {
  customers: CustomerOpt[];
  locations: LocationOpt[];
  skuOptions: SkuOpt[];
  today: string;
}) {
  const { t, m } = useT();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createDraftSalesOrder,
    null,
  );
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [currency, setCurrency] = useState<Currency>(customers[0]?.defaultCurrency ?? 'USD');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && state.data?.id) {
      router.push(`/sales/orders/${state.data.id}`);
    }
  }, [state, router]);

  const unitFor = (skuId: string) => skuOptions.find((s) => s.id === skuId)?.unit ?? '';
  const lineTotal = (row: ItemRow) => {
    const qty = Number(row.orderedQty) || 0;
    const price = Number(row.unitPrice) || 0;
    return (qty * price).toFixed(2);
  };

  function updateItem(key: number, patch: Partial<ItemRow>) {
    setItems((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        const area = Number(next.areaPerSheet);
        const priceSqm = Number(next.pricePerSqm);
        if (next.areaPerSheet && next.pricePerSqm && area > 0 && priceSqm >= 0) {
          next.unitPrice = String(computeUnitPriceFromArea(priceSqm, area));
        }
        const totalArea = Number(next.totalArea);
        if (next.totalArea && next.areaPerSheet && area > 0 && totalArea >= 0) {
          next.orderedQty = String(computeOrderedQtyFromArea(totalArea, area));
        }
        return next;
      }),
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valid = items.filter((r) => r.skuId && r.locationId && r.orderedQty && r.unitPrice);
    if (valid.length === 0) return;
    const payload = valid.map((r) => ({
      skuId: r.skuId,
      locationId: r.locationId,
      orderedQty: Number(r.orderedQty),
      unitPrice: Number(r.unitPrice),
      areaPerSheet: r.areaPerSheet ? Number(r.areaPerSheet) : undefined,
      pricePerSqm: r.pricePerSqm ? Number(r.pricePerSqm) : undefined,
    }));
    const fd = new FormData(formRef.current!);
    fd.set('itemsJson', JSON.stringify(payload));
    formAction(fd);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sal.newSo')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customerId">{t('sal.customer')}</Label>
            <NativeSelect
              id="customerId"
              name="customerId"
              required
              defaultValue=""
              onChange={(e) => {
                const cust = customers.find((c) => c.id === e.target.value);
                if (cust) setCurrency(cust.defaultCurrency);
              }}
            >
              <option value="" disabled>
                {t('common.select')}
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="currency">{t('sal.currency')}</Label>
            <NativeSelect
              id="currency"
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="orderDate">{t('sal.orderDate')}</Label>
            <Input id="orderDate" name="orderDate" type="date" defaultValue={today} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expectedDeliveryDate">{t('sal.expectedDelivery')}</Label>
            <Input id="expectedDeliveryDate" name="expectedDeliveryDate" type="date" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">{t('common.notes')}</Label>
            <Input id="notes" name="notes" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('sal.attachment')}</Label>
            <AttachmentField name="attachmentPath" label={t('sal.attachment')} folder="so" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sal.lineItems')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((row) => (
            <div key={row.key} className="grid grid-cols-12 items-end gap-2 rounded-md border p-3">
              <div className="col-span-12 space-y-1.5 sm:col-span-4">
                <Label>{t('inv.specification')}</Label>
                <NativeSelect
                  data-testid="so-item-sku"
                  value={row.skuId}
                  onChange={(e) => updateItem(row.key, { skuId: e.target.value })}
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
              <div className="col-span-6 space-y-1.5 sm:col-span-3">
                <Label>{t('common.location')}</Label>
                <NativeSelect
                  data-testid="so-item-location"
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
                </NativeSelect>
              </div>
              <div className="col-span-6 space-y-1.5 sm:col-span-2">
                <Label>
                  {t('sal.orderedQty')} {row.skuId ? `(${unitFor(row.skuId)})` : ''}
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0.001"
                  data-testid="so-item-qty"
                  value={row.orderedQty}
                  onChange={(e) => updateItem(row.key, { orderedQty: e.target.value })}
                  readOnly={!!(row.totalArea && row.areaPerSheet)}
                  className={row.totalArea && row.areaPerSheet ? 'bg-muted' : undefined}
                  required
                />
              </div>
              <div className="col-span-8 space-y-1.5 sm:col-span-2">
                <Label>{t('sal.unitPrice')}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  data-testid="so-item-price"
                  value={row.unitPrice}
                  onChange={(e) => updateItem(row.key, { unitPrice: e.target.value })}
                  readOnly={!!(row.areaPerSheet && row.pricePerSqm)}
                  className={row.areaPerSheet && row.pricePerSqm ? 'bg-muted' : undefined}
                  required
                />
              </div>
              <div className="col-span-3 space-y-1.5 sm:col-span-1">
                <Label>{t('sal.lineTotal')}</Label>
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
              <div className="col-span-6 space-y-1.5 sm:col-span-4">
                <Label>{t('sal.totalArea')}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  data-testid="so-item-total-area"
                  value={row.totalArea}
                  onChange={(e) => updateItem(row.key, { totalArea: e.target.value })}
                  placeholder="m²"
                />
              </div>
              <div className="col-span-6 space-y-1.5 sm:col-span-4">
                <Label>{t('sal.areaPerSheet')}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  data-testid="so-item-area"
                  value={row.areaPerSheet}
                  onChange={(e) => updateItem(row.key, { areaPerSheet: e.target.value })}
                  placeholder="m²"
                />
              </div>
              <div className="col-span-6 space-y-1.5 sm:col-span-4">
                <Label>{t('sal.pricePerSqm')}</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0"
                  data-testid="so-item-price-sqm"
                  value={row.pricePerSqm}
                  onChange={(e) => updateItem(row.key, { pricePerSqm: e.target.value })}
                  placeholder={`$/m²`}
                />
              </div>
              {!!(row.totalArea && row.areaPerSheet) && (
                <p className="col-span-12 text-xs text-muted-foreground">
                  {t('sal.totalAreaHint')}
                </p>
              )}
              {!!(row.areaPerSheet && row.pricePerSqm) && (
                <p className="col-span-12 text-xs text-muted-foreground">
                  {t('sal.pricePerSqmHint')}
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, emptyRow()])}
          >
            {t('sal.addItem')}
          </Button>

          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(state.error)}
            </p>
          )}
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('sal.createDraft')}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
