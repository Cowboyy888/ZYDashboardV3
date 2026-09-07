'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Download, FileText, History, Copy, Pencil, Plus, Search, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmActionButton } from '@/components/forms/confirm-action-button';
import { FormError } from '@/components/forms/form-error';
import { useT } from '@/components/i18n-provider';
import {
  createPriceRecord,
  updatePriceRecord,
  deactivatePriceRecord,
} from '@/lib/actions/price-records';
import { CURRENCIES, CURRENCY_LABELS } from '@/lib/domain/purchasing';
import { PRICE_STATUSES } from '@/lib/domain/price-records';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { ActionState } from '@/lib/actions/types';
import type { PriceRecordRow, PriceTypeRow } from '@/lib/db/types';
import type { PriceRecordCounts } from '@/lib/db/queries';

type Opt = { id: string; name: string };
type SkuOpt = { id: string; unit: string; familyName: string; label: string };

export interface PriceFilterValues {
  q: string;
  skuId: string;
  customerId: string;
  priceTypeId: string;
  status: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
}

const STATUS_VARIANT = {
  active: 'success',
  expired: 'warning',
  cancelled: 'destructive',
} as const;

export function PricesClient({
  records,
  historyRows,
  counts,
  priceTypes,
  skuOptions,
  customers,
  profileName,
  canManage,
  filters,
}: {
  records: PriceRecordRow[];
  /** Every price_records row for the skus on this page — filtered client-side per row for History. */
  historyRows: PriceRecordRow[];
  counts: PriceRecordCounts;
  priceTypes: PriceTypeRow[];
  skuOptions: SkuOpt[];
  customers: Opt[];
  profileName: Record<string, string>;
  canManage: boolean;
  filters: PriceFilterValues;
}) {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const skuById = useMemo(() => new Map(skuOptions.map((s) => [s.id, s])), [skuOptions]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const priceTypeById = useMemo(() => new Map(priceTypes.map((pt) => [pt.id, pt])), [priceTypes]);
  const activePriceTypes = useMemo(() => priceTypes.filter((pt) => pt.is_active), [priceTypes]);

  const [search, setSearch] = useState(filters.q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function onSearchChange(next: string) {
    setSearch(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushParams({ q: next.trim() || undefined }), 350);
  }

  // Same filters as the on-screen table, carried onto the download links so
  // "download" always exports what's currently filtered, not everything.
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.q.trim()) params.set('q', filters.q.trim());
    if (filters.skuId) params.set('skuId', filters.skuId);
    if (filters.customerId) params.set('customerId', filters.customerId);
    if (filters.priceTypeId) params.set('priceTypeId', filters.priceTypeId);
    if (filters.status) params.set('status', filters.status);
    if (filters.currency) params.set('currency', filters.currency);
    if (filters.effectiveFrom) params.set('effectiveFrom', filters.effectiveFrom);
    if (filters.effectiveTo) params.set('effectiveTo', filters.effectiveTo);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [filters]);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<PriceRecordRow | null>(null);
  const [duplicating, setDuplicating] = useState<PriceRecordRow | null>(null);
  const [historyFor, setHistoryFor] = useState<PriceRecordRow | null>(null);

  const kpis: Array<{ label: string; value: string }> = [
    { label: t('pr.kpiActive'), value: String(counts.active) },
    { label: t('pr.kpiExpired'), value: String(counts.expired) },
    { label: t('pr.kpiCustomerPrices'), value: String(counts.customerPrices) },
    { label: t('pr.kpiSpecialPrices'), value: String(counts.specialPrices) },
    { label: t('pr.kpiChangedThisMonth'), value: String(counts.changedThisMonth) },
    { label: t('pr.kpiExpiringSoon'), value: String(counts.expiringSoon) },
  ];

  const historyForRows = historyFor
    ? historyRows
        .filter((r) => r.sku_id === historyFor.sku_id && r.customer_id === historyFor.customer_id)
        .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1))
    : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="pr-search">{t('common.search')}</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="pr-search"
                placeholder={t('pr.searchPlaceholder')}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-filter-sku">{t('pr.product')}</Label>
            <NativeSelect
              id="pr-filter-sku"
              defaultValue={filters.skuId}
              onChange={(e) => pushParams({ skuId: e.target.value || undefined })}
              className="w-48"
            >
              <option value="">{t('common.all')}</option>
              {skuOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-filter-customer">{t('pr.customer')}</Label>
            <NativeSelect
              id="pr-filter-customer"
              defaultValue={filters.customerId}
              onChange={(e) => pushParams({ customerId: e.target.value || undefined })}
              className="w-40"
            >
              <option value="">{t('common.all')}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-filter-type">{t('pr.priceType')}</Label>
            <NativeSelect
              id="pr-filter-type"
              defaultValue={filters.priceTypeId}
              onChange={(e) => pushParams({ priceTypeId: e.target.value || undefined })}
              className="w-40"
            >
              <option value="">{t('common.all')}</option>
              {priceTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>
                  {pt.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-filter-status">{t('common.status')}</Label>
            <NativeSelect
              id="pr-filter-status"
              defaultValue={filters.status}
              onChange={(e) => pushParams({ status: e.target.value || undefined })}
              className="w-32"
            >
              <option value="">{t('common.all')}</option>
              {PRICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`pr.status.${s}` as const)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-filter-currency">{t('pr.currency')}</Label>
            <NativeSelect
              id="pr-filter-currency"
              defaultValue={filters.currency}
              onChange={(e) => pushParams({ currency: e.target.value || undefined })}
              className="w-28"
            >
              <option value="">{t('common.all')}</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-filter-from">{t('common.dateFrom')}</Label>
            <Input
              id="pr-filter-from"
              type="date"
              defaultValue={filters.effectiveFrom}
              max={filters.effectiveTo || undefined}
              onChange={(e) => pushParams({ effectiveFrom: e.target.value || undefined })}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pr-filter-to">{t('common.dateTo')}</Label>
            <Input
              id="pr-filter-to"
              type="date"
              defaultValue={filters.effectiveTo}
              min={filters.effectiveFrom || undefined}
              onChange={(e) => pushParams({ effectiveTo: e.target.value || undefined })}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <a href={`/api/export/price-records${exportQuery}`}>
            <Download className="h-4 w-4" /> {t('common.exportExcel')}
          </a>
        </Button>
        <Button asChild variant="outline">
          <a
            href={`/api/export/price-records/pdf${exportQuery}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FileText className="h-4 w-4" /> {t('pr.exportPdf')}
          </a>
        </Button>
        {canManage && (
          <Button
            variant={showCreate ? 'secondary' : 'default'}
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? t('common.close') : t('pr.new')}
          </Button>
        )}
      </div>

      {canManage && showCreate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('pr.new')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PriceRecordForm
              action={createPriceRecord}
              skuOptions={skuOptions}
              customers={customers}
              priceTypes={activePriceTypes}
              onDone={() => setShowCreate(false)}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pr.product')}</TableHead>
                <TableHead>{t('pr.customer')}</TableHead>
                <TableHead className="text-right">{t('pr.price')}</TableHead>
                <TableHead>{t('pr.priceType')}</TableHead>
                <TableHead>{t('pr.effectiveDate')}</TableHead>
                <TableHead>{t('pr.expiryDate')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('pr.createdBy')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => {
                const sku = skuById.get(r.sku_id);
                const customer = r.customer_id ? customerById.get(r.customer_id) : null;
                const priceType = priceTypeById.get(r.price_type_id);
                return (
                  <TableRow key={r.id}>
                    <TableCell>{sku?.label ?? '—'}</TableCell>
                    <TableCell>{customer?.name ?? t('pr.allCustomers')}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.price.toFixed(4)} {r.currency}
                    </TableCell>
                    <TableCell>{priceType?.name ?? '—'}</TableCell>
                    <TableCell>{formatDDMMYYYY(r.effective_date)}</TableCell>
                    <TableCell>{r.expiry_date ? formatDDMMYYYY(r.expiry_date) : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status]}>
                        {t(`pr.status.${r.status}` as const)}
                      </Badge>
                    </TableCell>
                    <TableCell>{(r.created_by && profileName[r.created_by]) || '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setHistoryFor(r)}
                          title={t('pr.viewHistory')}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {canManage && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setDuplicating(r)}
                              title={t('pr.duplicate')}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(r)}
                              title={t('common.edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {r.status === 'active' && (
                              <ConfirmActionButton
                                action={deactivatePriceRecord}
                                formData={{ id: r.id }}
                                label={t('pr.deactivate')}
                                confirmText={t('pr.deactivateConfirm')}
                                variant="ghost"
                                onSuccess={() => router.refresh()}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {records.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    {t('pr.noRecords')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {canManage && (
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto text-left">
            <DialogHeader>
              <DialogTitle>{t('pr.edit')}</DialogTitle>
            </DialogHeader>
            {editing && (
              <PriceRecordForm
                action={updatePriceRecord}
                editingId={editing.id}
                seed={editing}
                skuOptions={skuOptions}
                customers={customers}
                priceTypes={activePriceTypes}
                onDone={() => setEditing(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Duplicate dialog — the create form, pre-filled from a source record with price + effective date left blank. */}
      {canManage && (
        <Dialog open={!!duplicating} onOpenChange={(o) => !o && setDuplicating(null)}>
          <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto text-left">
            <DialogHeader>
              <DialogTitle>{t('pr.duplicate')}</DialogTitle>
              <DialogDescription>{t('pr.duplicateHint')}</DialogDescription>
            </DialogHeader>
            {duplicating && (
              <PriceRecordForm
                action={createPriceRecord}
                seed={{ ...duplicating, price: null, effective_date: '' }}
                skuOptions={skuOptions}
                customers={customers}
                priceTypes={activePriceTypes}
                onDone={() => setDuplicating(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* History dialog */}
      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto text-left">
          <DialogHeader>
            <DialogTitle>{t('pr.priceHistory')}</DialogTitle>
            <DialogDescription>
              {historyFor && (skuById.get(historyFor.sku_id)?.label ?? '—')}
              {' · '}
              {historyFor?.customer_id
                ? (customerById.get(historyFor.customer_id)?.name ?? '—')
                : t('pr.allCustomers')}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pr.effectiveDate')}</TableHead>
                <TableHead className="text-right">{t('pr.price')}</TableHead>
                <TableHead>{t('pr.priceType')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('pr.createdBy')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyForRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDDMMYYYY(r.effective_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.price.toFixed(4)} {r.currency}
                  </TableCell>
                  <TableCell>{priceTypeById.get(r.price_type_id)?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>
                      {t(`pr.status.${r.status}` as const)}
                    </Badge>
                  </TableCell>
                  <TableCell>{(r.created_by && profileName[r.created_by]) || '—'}</TableCell>
                </TableRow>
              ))}
              {historyForRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('pr.noRecords')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- Create/Edit/Duplicate form -----------------------------------------------

/** Loosely-typed seed so a duplicate can blank out price/effective_date without satisfying the full row shape. */
type SeedRecord = Partial<Omit<PriceRecordRow, 'price'>> & { price?: number | null };

function PriceRecordForm({
  action,
  editingId,
  seed,
  skuOptions,
  customers,
  priceTypes,
  onDone,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  /** Present only when editing an existing record in place (hidden `id` field). */
  editingId?: string;
  seed?: SeedRecord;
  skuOptions: SkuOpt[];
  customers: Opt[];
  priceTypes: PriceTypeRow[];
  onDone: () => void;
}) {
  const { t, m, locale } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  const [skuId, setSkuId] = useState(seed?.sku_id ?? '');
  const [unit, setUnit] = useState(seed?.unit ?? '');

  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function onSkuChange(id: string) {
    setSkuId(id);
    if (!unit) {
      const s = skuOptions.find((o) => o.id === id);
      if (s) setUnit(s.unit);
    }
  }

  const err = (k: string) =>
    state?.fieldErrors?.[k] ? (
      <p className="text-xs text-destructive">{m(state.fieldErrors[k])}</p>
    ) : null;

  return (
    <form action={formAction} className="space-y-4">
      {editingId && <input type="hidden" name="id" value={editingId} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prf-sku">
            {t('pr.product')} <span className="text-destructive">*</span>
          </Label>
          <NativeSelect
            id="prf-sku"
            name="skuId"
            value={skuId}
            onChange={(e) => onSkuChange(e.target.value)}
            className={state?.fieldErrors?.skuId ? 'border-destructive' : ''}
          >
            <option value="">{t('common.select')}</option>
            {skuOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
          {err('skuId')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prf-customer">{t('pr.customer')}</Label>
          <NativeSelect id="prf-customer" name="customerId" defaultValue={seed?.customer_id ?? ''}>
            <option value="">{t('pr.allCustomers')}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="prf-price">
            {t('pr.price')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="prf-price"
            name="price"
            type="number"
            step="0.0001"
            min="0"
            defaultValue={seed?.price?.toString() ?? ''}
            className={state?.fieldErrors?.price ? 'border-destructive' : ''}
          />
          {err('price')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prf-currency">
            {t('pr.currency')} <span className="text-destructive">*</span>
          </Label>
          <NativeSelect id="prf-currency" name="currency" defaultValue={seed?.currency ?? 'USD'}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_LABELS[c][locale]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prf-unit">
            {t('common.unit')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="prf-unit"
            name="unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className={state?.fieldErrors?.unit ? 'border-destructive' : ''}
          />
          {err('unit')}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prf-type">
            {t('pr.priceType')} <span className="text-destructive">*</span>
          </Label>
          <NativeSelect
            id="prf-type"
            name="priceTypeId"
            defaultValue={seed?.price_type_id ?? ''}
            className={state?.fieldErrors?.priceTypeId ? 'border-destructive' : ''}
          >
            <option value="">{t('common.select')}</option>
            {priceTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>
                {pt.name}
              </option>
            ))}
          </NativeSelect>
          {err('priceTypeId')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prf-minqty">{t('pr.minimumQuantity')}</Label>
          <Input
            id="prf-minqty"
            name="minimumQuantity"
            type="number"
            step="0.001"
            min="0"
            defaultValue={seed?.minimum_quantity?.toString() ?? ''}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="prf-effective">
            {t('pr.effectiveDate')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="prf-effective"
            name="effectiveDate"
            type="date"
            defaultValue={seed?.effective_date ?? ''}
            className={state?.fieldErrors?.effectiveDate ? 'border-destructive' : ''}
          />
          {err('effectiveDate')}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prf-expiry">{t('pr.expiryDate')}</Label>
          <Input
            id="prf-expiry"
            name="expiryDate"
            type="date"
            defaultValue={seed?.expiry_date ?? ''}
            className={state?.fieldErrors?.expiryDate ? 'border-destructive' : ''}
          />
          {err('expiryDate')}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="prf-notes">{t('common.notes')}</Label>
        <Textarea id="prf-notes" name="notes" rows={2} defaultValue={seed?.notes ?? ''} />
      </div>

      <FormError error={state?.error} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('pr.savePrice')}
        </Button>
      </div>
    </form>
  );
}
