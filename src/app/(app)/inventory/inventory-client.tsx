'use client';
import { useEffect, useMemo, useRef, useState, useTransition, useActionState } from 'react';
import { Loader2, Pencil, Plus, X, Download, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NativeSelect } from '@/components/ui/native-select';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { ConfirmActionButton } from '@/components/forms/confirm-action-button';
import { FormError } from '@/components/forms/form-error';
import { SendNowButton } from '@/components/telegram/send-now-button';
import { useT } from '@/components/i18n-provider';
import { postMovement, postTransfer, setStockTotal } from '@/lib/actions/inventory';
import { sendInventoryNow } from '@/lib/actions/telegram';
import { createSku, updateSku, toggleSku, deleteSku } from '@/lib/actions/settings';
import { CONDITIONS, CONDITION_LABELS } from '@/lib/domain/products';
import { MOVEMENT_DIRECTION, type MovementType } from '@/lib/domain/stock-ledger';
import { type MessageKey } from '@/lib/i18n';
import type { ActionState } from '@/lib/actions/types';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { round3 } from '@/lib/domain/stock-ledger';
import {
  totalsByFamilyUnit,
  totalsBySpecTypeUnit,
  type InventoryDisplayRow,
  type InventoryReportRow,
} from '@/lib/domain/inventory-view';
import type { StockMovementRow, SkuRow } from '@/lib/db/types';

interface LocationOpt {
  id: string;
  name: string;
  code: string;
}

interface FamilyOpt {
  id: string;
  name: string;
  name_english: string | null;
}

export function InventoryClient({
  rows,
  archivedRows,
  reportRows,
  skus,
  families,
  locations,
  movements,
  allowedTypes,
  canTransfer,
  canOverride,
  canSend,
  canManageProducts,
  today,
}: {
  rows: InventoryDisplayRow[];
  /** Same shape as `rows`, but for archived specs — see toggleSku/StockRow's Archive button. */
  archivedRows: InventoryDisplayRow[];
  reportRows: InventoryReportRow[];
  skus: SkuRow[];
  families: FamilyOpt[];
  locations: LocationOpt[];
  movements: StockMovementRow[];
  allowedTypes: MovementType[];
  canTransfer: boolean;
  canOverride: boolean;
  canSend: boolean;
  canManageProducts: boolean;
  today: string;
}) {
  const { t } = useT();
  const [showAddSpec, setShowAddSpec] = useState(false);
  const skuLabel = new Map(rows.map((r) => [r.skuId, r.label]));
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const canRecord = allowedTypes.length > 0 || canTransfer;
  const canAdjust = allowedTypes.includes('adjustment');
  const storageLocationId = locations.find((l) => l.code === 'storage_room')?.id;
  const warehouseLocationId = locations.find((l) => l.code === 'warehouse')?.id;
  const typeLabel = (ty: MovementType) => t(`inv.movement.${ty}` as MessageKey);
  const famTotals = totalsByFamilyUnit(rows);
  const canManageRow = canManageProducts || canAdjust;

  return (
    <Tabs defaultValue="stock">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="stock">{t('inv.stockTab')}</TabsTrigger>
          {canRecord && <TabsTrigger value="record">{t('inv.recordTab')}</TabsTrigger>}
          <TabsTrigger value="ledger">{t('inv.ledgerTab')}</TabsTrigger>
          <TabsTrigger value="report">{t('inv.reportTab')}</TabsTrigger>
          {canManageProducts && <TabsTrigger value="archived">{t('inv.archivedTab')}</TabsTrigger>}
        </TabsList>
        {canSend && (
          <SendNowButton
            action={sendInventoryNow}
            label={t('inv.sendInventory')}
            confirmText={t('common.confirmSendReport')}
          />
        )}
      </div>

      {/* --- Stock balances --- */}
      <TabsContent value="stock" className="space-y-3">
        {canManageProducts && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('set.addSpec')}</CardTitle>
              <Button
                type="button"
                size="sm"
                variant={showAddSpec ? 'secondary' : 'default'}
                onClick={() => setShowAddSpec((s) => !s)}
              >
                {showAddSpec ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {showAddSpec ? t('common.close') : t('set.addSpecBtn')}
              </Button>
            </CardHeader>
            {showAddSpec && (
              <CardContent>
                <CreateSkuForm
                  families={families}
                  locations={allowedTypes.includes('opening_balance') ? locations : []}
                  onDone={() => setShowAddSpec(false)}
                />
              </CardContent>
            )}
          </Card>
        )}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inv.specification')}</TableHead>
                  <TableHead className="text-right">{t('inv.storageRoom')}</TableHead>
                  <TableHead className="text-right">{t('inv.warehouse')}</TableHead>
                  <TableHead className="text-right">{t('inv.company')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  {canManageRow && (
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <StockRow
                    key={r.skuId}
                    row={r}
                    sku={skuById.get(r.skuId)}
                    families={families}
                    canManageProducts={canManageProducts}
                    canAdjust={canAdjust}
                    canOverride={canOverride}
                    storageLocationId={storageLocationId}
                    warehouseLocationId={warehouseLocationId}
                    today={today}
                  />
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManageRow ? 6 : 5}
                      className="text-center text-muted-foreground"
                    >
                      {t('inv.noSpecs')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('inv.totalsByFamily')}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {famTotals.map((f) => (
              <div key={`${f.familyId}-${f.unit}`} className="flex items-baseline gap-2 text-sm">
                <span className="text-muted-foreground">{f.familyName}</span>
                <span className="font-semibold tabular-nums">
                  {f.total.toLocaleString()} {f.unit}
                </span>
              </div>
            ))}
            {famTotals.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
          </div>
        </div>
      </TabsContent>

      {/* --- Record movement / transfer --- */}
      {canRecord && (
        <TabsContent value="record" className="grid gap-4 lg:grid-cols-2">
          {allowedTypes.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('inv.recordMovement')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={postMovement}>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-type">{t('inv.type')}</Label>
                    <NativeSelect id="m-type" name="type" defaultValue={allowedTypes[0]}>
                      {allowedTypes.map((ty) => (
                        <option key={ty} value={ty}>
                          {typeLabel(ty)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-sku">{t('inv.specification')}</Label>
                    <NativeSelect id="m-sku" name="skuId" required defaultValue="">
                      <option value="" disabled>
                        {t('common.select')}
                      </option>
                      {rows.map((r) => (
                        <option key={r.skuId} value={r.skuId}>
                          {r.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-loc">{t('common.location')}</Label>
                      <NativeSelect id="m-loc" name="locationId" required defaultValue="">
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
                    <div className="space-y-1.5">
                      <Label htmlFor="m-qty">{t('common.quantity')}</Label>
                      <Input
                        id="m-qty"
                        name="quantity"
                        type="number"
                        step="0.001"
                        required
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-date">{t('common.date')}</Label>
                    <Input
                      id="m-date"
                      name="businessDate"
                      type="date"
                      defaultValue={today}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-notes">{t('common.notes')}</Label>
                    <Input id="m-notes" name="notes" />
                  </div>
                  {canOverride && (
                    <div className="space-y-1.5">
                      <Label htmlFor="m-override">{t('inv.overrideLabel')}</Label>
                      <Input
                        id="m-override"
                        name="overrideReason"
                        placeholder={t('inv.overridePlaceholder')}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">{t('inv.adjustNote')}</p>
                  <SubmitButton>{t('inv.recordTab')}</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {canTransfer && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t('inv.transferTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={postTransfer}>
                  <div className="space-y-1.5">
                    <Label htmlFor="tr-sku">{t('inv.specification')}</Label>
                    <NativeSelect id="tr-sku" name="skuId" required defaultValue="">
                      <option value="" disabled>
                        {t('common.select')}
                      </option>
                      {rows.map((r) => (
                        <option key={r.skuId} value={r.skuId}>
                          {r.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tr-from">{t('inv.from')}</Label>
                      <NativeSelect id="tr-from" name="fromLocationId" required defaultValue="">
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
                    <div className="space-y-1.5">
                      <Label htmlFor="tr-to">{t('inv.to')}</Label>
                      <NativeSelect id="tr-to" name="toLocationId" required defaultValue="">
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
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tr-qty">{t('common.quantity')}</Label>
                      <Input
                        id="tr-qty"
                        name="quantity"
                        type="number"
                        step="0.001"
                        min="0"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="tr-date">{t('common.date')}</Label>
                      <Input
                        id="tr-date"
                        name="businessDate"
                        type="date"
                        defaultValue={today}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tr-notes">{t('common.notes')}</Label>
                    <Input id="tr-notes" name="notes" />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('inv.transferNote')}</p>
                  <SubmitButton>{t('inv.transfer')}</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      )}

      {/* --- Ledger --- */}
      <TabsContent value="ledger">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('inv.type')}</TableHead>
                  <TableHead>{t('inv.specification')}</TableHead>
                  <TableHead>{t('common.location')}</TableHead>
                  <TableHead className="text-right">{t('common.quantity')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const dir = MOVEMENT_DIRECTION[m.type];
                  const qty = Number(m.quantity);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDDMMYYYY(m.business_date)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            dir === 'out' ? 'destructive' : dir === 'in' ? 'success' : 'secondary'
                          }
                        >
                          {typeLabel(m.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[320px] truncate text-sm">
                        {skuLabel.get(m.sku_id) ?? m.sku_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {locationName.get(m.location_id) ?? '—'}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold tabular-nums ${qty < 0 ? 'text-destructive' : 'text-success'}`}
                      >
                        {qty > 0 ? '+' : ''}
                        {qty}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {movements.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {t('inv.noMovements')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Report: Standard / Special split --- */}
      <TabsContent value="report">
        <InventoryReportPanel reportRows={reportRows} />
      </TabsContent>

      {/* --- Archived specs: where "Archive" on the Stock tab actually sends them --- */}
      {canManageProducts && (
        <TabsContent value="archived" className="space-y-3">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('inv.specification')}</TableHead>
                    <TableHead className="text-right">{t('inv.storageRoom')}</TableHead>
                    <TableHead className="text-right">{t('inv.warehouse')}</TableHead>
                    <TableHead className="text-right">{t('inv.company')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivedRows.map((r) => (
                    <TableRow key={r.skuId}>
                      <TableCell className="max-w-[420px]">
                        <span className="truncate text-muted-foreground line-through">
                          {r.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.storageRoom}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.warehouse}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {r.total} {r.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <ActionForm action={toggleSku} className="space-y-0">
                            <input type="hidden" name="id" value={r.skuId} />
                            <input type="hidden" name="isActive" value="false" />
                            <SubmitButton variant="ghost" size="sm">
                              {t('common.reactivate')}
                            </SubmitButton>
                          </ActionForm>
                          {r.total === 0 ? (
                            <ConfirmActionButton
                              action={deleteSku}
                              formData={{ id: r.skuId }}
                              label={t('common.delete')}
                              confirmText={t('inv.confirmDeleteArchivedBody')}
                              variant="destructive"
                            />
                          ) : (
                            <span
                              className="text-xs text-muted-foreground"
                              title={t('inv.hasStockHint')}
                            >
                              {t('inv.hasStockHint')}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {archivedRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        {t('inv.noArchivedSpecs')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </Tabs>
  );
}

// --- Report tab: Standard / Special split, filters, totals, exports ---------

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function InventoryReportPanel({ reportRows }: { reportRows: InventoryReportRow[] }) {
  const { t } = useT();
  const [specTypeFilter, setSpecTypeFilter] = useState<'all' | 'standard' | 'special'>('all');
  const [diameterFilter, setDiameterFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [holeFilter, setHoleFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'low' | 'ok'>('all');

  const diameterOptions = useMemo(
    () => uniqueSorted(reportRows.map((r) => r.diameter)),
    [reportRows],
  );
  const sizeOptions = useMemo(() => uniqueSorted(reportRows.map((r) => r.size)), [reportRows]);
  const holeOptions = useMemo(() => uniqueSorted(reportRows.map((r) => r.hole)), [reportRows]);
  const customerOptions = useMemo(
    () =>
      uniqueSorted(reportRows.map((r) => (r.customerProject === '—' ? null : r.customerProject))),
    [reportRows],
  );

  const filtered = useMemo(
    () =>
      reportRows.filter((r) => {
        if (specTypeFilter !== 'all' && r.specType !== specTypeFilter) return false;
        if (diameterFilter && r.diameter !== diameterFilter) return false;
        if (sizeFilter && r.size !== sizeFilter) return false;
        if (holeFilter && r.hole !== holeFilter) return false;
        if (customerFilter && r.customerProject !== customerFilter) return false;
        if (statusFilter === 'low' && !r.isLow) return false;
        if (statusFilter === 'ok' && r.isLow) return false;
        return true;
      }),
    [
      reportRows,
      specTypeFilter,
      diameterFilter,
      sizeFilter,
      holeFilter,
      customerFilter,
      statusFilter,
    ],
  );

  const standardRows = filtered.filter((r) => r.specType === 'standard');
  const specialRows = filtered.filter((r) => r.specType === 'special');

  const unitTotals = totalsBySpecTypeUnit(filtered);
  const standardTotals = unitTotals.filter((u) => u.specType === 'standard');
  const specialTotals = unitTotals.filter((u) => u.specType === 'special');
  const reservedByUnit = new Map<string, number>();
  const availableByUnit = new Map<string, number>();
  for (const u of unitTotals) {
    reservedByUnit.set(u.unit, round3((reservedByUnit.get(u.unit) ?? 0) + u.reservedTotal));
    availableByUnit.set(u.unit, round3((availableByUnit.get(u.unit) ?? 0) + u.availableTotal));
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end justify-between gap-3 pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rep-spec">{t('inv.filterSpecType')}</Label>
              <NativeSelect
                id="rep-spec"
                value={specTypeFilter}
                onChange={(e) => setSpecTypeFilter(e.target.value as typeof specTypeFilter)}
                className="w-44"
              >
                <option value="all">{t('common.all')}</option>
                <option value="standard">{t('inv.standardSpec')}</option>
                <option value="special">{t('inv.specialSpec')}</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-dia">{t('inv.diameter')}</Label>
              <NativeSelect
                id="rep-dia"
                value={diameterFilter}
                onChange={(e) => setDiameterFilter(e.target.value)}
                className="w-32"
              >
                <option value="">{t('common.all')}</option>
                {diameterOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-size">{t('inv.size')}</Label>
              <NativeSelect
                id="rep-size"
                value={sizeFilter}
                onChange={(e) => setSizeFilter(e.target.value)}
                className="w-32"
              >
                <option value="">{t('common.all')}</option>
                {sizeOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-hole">{t('inv.meshOpening')}</Label>
              <NativeSelect
                id="rep-hole"
                value={holeFilter}
                onChange={(e) => setHoleFilter(e.target.value)}
                className="w-32"
              >
                <option value="">{t('common.all')}</option>
                {holeOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-cust">{t('inv.customerProject')}</Label>
              <NativeSelect
                id="rep-cust"
                value={customerFilter}
                onChange={(e) => setCustomerFilter(e.target.value)}
                className="w-40"
              >
                <option value="">{t('common.all')}</option>
                {customerOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-status">{t('common.status')}</Label>
              <NativeSelect
                id="rep-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="w-32"
              >
                <option value="all">{t('common.all')}</option>
                <option value="low">{t('common.low')}</option>
                <option value="ok">{t('common.ok')}</option>
              </NativeSelect>
            </div>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href="/api/export/inventory/pdf" target="_blank" rel="noopener noreferrer">
                <FileText className="h-4 w-4" /> {t('inv.downloadPdf')}
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/export/inventory">
                <Download className="h-4 w-4" /> {t('inv.downloadExcel')}
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <ReportTotals
        title={t('inv.totalStandardStock')}
        totals={standardTotals.map((u) => ({ unit: u.unit, value: u.stockTotal }))}
      />
      <ReportTotals
        title={t('inv.totalSpecialStock')}
        totals={specialTotals.map((u) => ({ unit: u.unit, value: u.stockTotal }))}
      />
      <ReportTotals
        title={t('inv.totalReserved')}
        totals={[...reservedByUnit.entries()].map(([unit, value]) => ({ unit, value }))}
      />
      <ReportTotals
        title={t('inv.totalAvailable')}
        totals={[...availableByUnit.entries()].map(([unit, value]) => ({ unit, value }))}
      />

      <ReportSection
        title={t('inv.standardSpec')}
        desc={t('inv.standardSpecDesc')}
        rows={standardRows}
        showExtra={false}
      />
      <ReportSection
        title={t('inv.specialSpec')}
        desc={t('inv.specialSpecDesc')}
        rows={specialRows}
        showExtra
      />
    </div>
  );
}

function ReportTotals({
  title,
  totals,
}: {
  title: string;
  totals: Array<{ unit: string; value: number }>;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5">
        {totals.map((u) => (
          <span key={u.unit} className="text-sm font-semibold tabular-nums">
            {u.value.toLocaleString()} {u.unit}
          </span>
        ))}
        {totals.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
      </div>
    </div>
  );
}

function ReportSection({
  title,
  desc,
  rows,
  showExtra,
}: {
  title: string;
  desc: string;
  rows: InventoryReportRow[];
  showExtra: boolean;
}) {
  const { t } = useT();
  const colSpan = showExtra ? 11 : 9;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base uppercase tracking-wide">{title}</CardTitle>
          <p className="text-xs text-muted-foreground">{desc}</p>
        </div>
        <Badge variant="secondary">{rows.length}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('inv.product')}</TableHead>
              <TableHead>{t('inv.diameter')}</TableHead>
              <TableHead>{t('inv.size')}</TableHead>
              <TableHead>{t('inv.meshOpening')}</TableHead>
              <TableHead className="text-right">{t('common.quantity')}</TableHead>
              <TableHead className="text-right">{t('inv.reserved')}</TableHead>
              <TableHead className="text-right">{t('inv.available')}</TableHead>
              <TableHead>{t('common.unit')}</TableHead>
              {showExtra && <TableHead>{t('common.status')}</TableHead>}
              {showExtra && <TableHead>{t('inv.customerProject')}</TableHead>}
              <TableHead>{t('inv.remarks')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.skuId}>
                <TableCell className="max-w-[260px] truncate">{r.familyName}</TableCell>
                <TableCell>{r.diameter ?? '—'}</TableCell>
                <TableCell>{r.size ?? '—'}</TableCell>
                <TableCell>{r.hole ?? '—'}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{r.total}</TableCell>
                <TableCell className="text-right tabular-nums">{r.reserved}</TableCell>
                <TableCell className="text-right tabular-nums">{r.available}</TableCell>
                <TableCell>{r.unit}</TableCell>
                {showExtra && (
                  <TableCell>
                    {r.isLow ? (
                      <Badge variant="warning">{t('common.low')}</Badge>
                    ) : (
                      <Badge variant="secondary">{t('common.ok')}</Badge>
                    )}
                  </TableCell>
                )}
                {showExtra && (
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                    {r.customerProject}
                  </TableCell>
                )}
                <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                  {r.notes ?? '—'}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
                  {t('inv.noReportRows')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// --- Stock table row (edit / archive / delete) --------------------------------

function StockRow({
  row,
  sku,
  families,
  canManageProducts,
  canAdjust,
  canOverride,
  storageLocationId,
  warehouseLocationId,
  today,
}: {
  row: InventoryDisplayRow;
  sku: SkuRow | undefined;
  families: FamilyOpt[];
  canManageProducts: boolean;
  canAdjust: boolean;
  canOverride: boolean;
  storageLocationId: string | undefined;
  warehouseLocationId: string | undefined;
  today: string;
}) {
  const { t } = useT();
  const [editOpen, setEditOpen] = useState(false);
  const [editAmountOpen, setEditAmountOpen] = useState(false);

  return (
    <TableRow>
      <TableCell className="max-w-[420px]">
        <span className="truncate">{row.label}</span>
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.storageRoom}</TableCell>
      <TableCell className="text-right tabular-nums">{row.warehouse}</TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {row.total} {row.unit}
      </TableCell>
      <TableCell>
        {row.isLow ? (
          <Badge variant="warning">{t('common.low')}</Badge>
        ) : (
          <Badge variant="secondary">{t('common.ok')}</Badge>
        )}
      </TableCell>
      {(canManageProducts || canAdjust) && (
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {canAdjust && (
              <Button variant="ghost" size="sm" onClick={() => setEditAmountOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                {t('inv.editAmount')}
              </Button>
            )}
            {canManageProducts && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)} disabled={!sku}>
                  {t('common.edit')}
                </Button>
                <ActionForm action={toggleSku} className="space-y-0">
                  <input type="hidden" name="id" value={row.skuId} />
                  <input type="hidden" name="isActive" value="true" />
                  <SubmitButton variant="ghost" size="sm">
                    {t('common.archive')}
                  </SubmitButton>
                </ActionForm>
                <ConfirmActionButton
                  action={deleteSku}
                  formData={{ id: row.skuId }}
                  label={t('common.delete')}
                  confirmText={t('set.confirmDeleteSpecBody')}
                  variant="destructive"
                />
              </>
            )}
          </div>
          {sku && canManageProducts && (
            <EditSkuDialog
              sku={sku}
              families={families}
              open={editOpen}
              onOpenChange={setEditOpen}
            />
          )}
          {canAdjust && (
            <EditQuantityDialog
              row={row}
              storageLocationId={storageLocationId}
              warehouseLocationId={warehouseLocationId}
              today={today}
              canOverride={canOverride}
              open={editAmountOpen}
              onOpenChange={setEditAmountOpen}
            />
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function EditQuantityDialog({
  row,
  storageLocationId,
  warehouseLocationId,
  today,
  canOverride,
  open,
  onOpenChange,
}: {
  row: InventoryDisplayRow;
  storageLocationId: string | undefined;
  warehouseLocationId: string | undefined;
  today: string;
  canOverride: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT();
  const [storageRoom, setStorageRoom] = useState(String(row.storageRoom));
  const [warehouse, setWarehouse] = useState(String(row.warehouse));
  const [notes, setNotes] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStorageRoom(String(row.storageRoom));
      setWarehouse(String(row.warehouse));
      setNotes('');
      setOverrideReason('');
      setError(null);
    }
  }, [open, row.storageRoom, row.warehouse]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const edits: Array<{ locationId: string; newTotal: string }> = [];
    if (storageLocationId && Number(storageRoom) !== row.storageRoom) {
      edits.push({ locationId: storageLocationId, newTotal: storageRoom });
    }
    if (warehouseLocationId && Number(warehouse) !== row.warehouse) {
      edits.push({ locationId: warehouseLocationId, newTotal: warehouse });
    }
    if (edits.length === 0) {
      onOpenChange(false);
      return;
    }
    start(async () => {
      for (const edit of edits) {
        const fd = new FormData();
        fd.set('skuId', row.skuId);
        fd.set('locationId', edit.locationId);
        fd.set('newTotal', edit.newTotal);
        fd.set('businessDate', today);
        fd.set('notes', notes);
        fd.set('overrideReason', overrideReason);
        const res = await setStockTotal(null, fd);
        if (!res?.ok) {
          setError(res?.error ?? 'Failed');
          return;
        }
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>{t('inv.editAmount')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{t('inv.editAmountHint')}</p>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`eq-storage-${row.skuId}`}>{t('inv.storageRoom')}</Label>
              <Input
                id={`eq-storage-${row.skuId}`}
                type="number"
                step="0.001"
                min="0"
                value={storageRoom}
                onChange={(e) => setStorageRoom(e.target.value)}
                disabled={!storageLocationId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`eq-warehouse-${row.skuId}`}>{t('inv.warehouse')}</Label>
              <Input
                id={`eq-warehouse-${row.skuId}`}
                type="number"
                step="0.001"
                min="0"
                value={warehouse}
                onChange={(e) => setWarehouse(e.target.value)}
                disabled={!warehouseLocationId}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`eq-notes-${row.skuId}`}>{t('common.notes')}</Label>
            <Input
              id={`eq-notes-${row.skuId}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {canOverride && (
            <div className="space-y-1.5">
              <Label htmlFor={`eq-override-${row.skuId}`}>{t('inv.overrideLabel')}</Label>
              <Input
                id={`eq-override-${row.skuId}`}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('inv.overridePlaceholder')}
              />
            </div>
          )}
          <FormError error={error} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditSkuDialog({
  sku,
  families,
  open,
  onOpenChange,
}: {
  sku: SkuRow;
  families: FamilyOpt[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, locale } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateSku, null);

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>{t('set.editSpec')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={sku.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`es-family-${sku.id}`}>{t('set.family')}</Label>
              <NativeSelect
                id={`es-family-${sku.id}`}
                name="familyId"
                required
                defaultValue={sku.family_id}
              >
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.name_english ? ` · ${f.name_english}` : ''}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`es-condition-${sku.id}`}>{t('common.condition')}</Label>
              <NativeSelect
                id={`es-condition-${sku.id}`}
                name="condition"
                defaultValue={sku.condition}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c][locale]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`es-dia-${sku.id}`}>{t('set.diameter')}</Label>
              <Input id={`es-dia-${sku.id}`} name="diameter" defaultValue={sku.diameter ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`es-size-${sku.id}`}>{t('set.size')}</Label>
              <Input id={`es-size-${sku.id}`} name="size" defaultValue={sku.size ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`es-hole-${sku.id}`}>{t('set.hole')}</Label>
              <Input id={`es-hole-${sku.id}`} name="hole" defaultValue={sku.hole ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`es-rod-${sku.id}`}>{t('set.rod')}</Label>
              <Input id={`es-rod-${sku.id}`} name="rodCount" defaultValue={sku.rod_count ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`es-unit-${sku.id}`}>{t('common.unit')}</Label>
              <Input id={`es-unit-${sku.id}`} name="unit" defaultValue={sku.unit} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`es-extra-${sku.id}`}>{t('set.extra')}</Label>
            <Input id={`es-extra-${sku.id}`} name="extra" defaultValue={sku.extra ?? ''} />
          </div>
          <FormError error={state?.error} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Add specification (SKU) form --------------------------------------------

function CreateSkuForm({
  families,
  locations,
  onDone,
}: {
  families: FamilyOpt[];
  locations: LocationOpt[];
  onDone: () => void;
}) {
  const { t, locale } = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(createSku, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      onDone();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-family">{t('set.family')}</Label>
          <NativeSelect id="inv-sku-family" name="familyId" required defaultValue="">
            <option value="" disabled>
              {t('common.select')}
            </option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.name_english ? ` · ${f.name_english}` : ''}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-condition">{t('common.condition')}</Label>
          <NativeSelect id="inv-sku-condition" name="condition" defaultValue="normal">
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c][locale]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-dia">{t('set.diameter')}</Label>
          <Input id="inv-sku-dia" name="diameter" placeholder="9厘" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-size">{t('set.size')}</Label>
          <Input id="inv-sku-size" name="size" placeholder="3×6" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-hole">{t('set.hole')}</Label>
          <Input id="inv-sku-hole" name="hole" placeholder="20孔" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-rod">{t('set.rod')}</Label>
          <Input id="inv-sku-rod" name="rodCount" placeholder="15根" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-unit">{t('common.unit')}</Label>
          <Input id="inv-sku-unit" name="unit" placeholder="张 / 捆" defaultValue="张" required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="inv-sku-extra">{t('set.extra')}</Label>
        <Input id="inv-sku-extra" name="extra" placeholder="free-form" />
      </div>
      {locations.length > 0 && (
        <div className="grid grid-cols-2 gap-3 rounded-md border border-dashed p-3 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-sku-opening-qty">{t('set.openingQty')}</Label>
            <Input
              id="inv-sku-opening-qty"
              name="openingQuantity"
              type="number"
              step="0.001"
              min="0"
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-sku-opening-loc">{t('common.location')}</Label>
            <NativeSelect id="inv-sku-opening-loc" name="openingLocationId" defaultValue="">
              <option value="">{t('common.select')}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <p className="col-span-2 text-xs text-muted-foreground lg:col-span-3">
            {t('set.openingQtyHint')}
          </p>
        </div>
      )}
      <FormError error={state?.error} />
      <SubmitButton>{t('common.save')}</SubmitButton>
    </form>
  );
}
