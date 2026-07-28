'use client';
import { useEffect, useRef, useState, useTransition, useActionState } from 'react';
import { Loader2, Pencil, Plus, X } from 'lucide-react';
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
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { ConfirmActionButton } from '@/components/forms/confirm-action-button';
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
import { totalsByFamilyUnit, type InventoryDisplayRow } from '@/lib/domain/inventory-view';
import type { StockMovementRow, SkuRow } from '@/lib/db/types';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
        </TabsList>
        {canSend && <SendNowButton action={sendInventoryNow} label={t('inv.sendInventory')} />}
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
                <CreateSkuForm families={families} onDone={() => setShowAddSpec(false)} />
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
                    <select
                      id="m-type"
                      name="type"
                      className={selectCls}
                      defaultValue={allowedTypes[0]}
                    >
                      {allowedTypes.map((ty) => (
                        <option key={ty} value={ty}>
                          {typeLabel(ty)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-sku">{t('inv.specification')}</Label>
                    <select id="m-sku" name="skuId" className={selectCls} required defaultValue="">
                      <option value="" disabled>
                        {t('common.select')}
                      </option>
                      {rows.map((r) => (
                        <option key={r.skuId} value={r.skuId}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="m-loc">{t('common.location')}</Label>
                      <select
                        id="m-loc"
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
                    <select id="tr-sku" name="skuId" className={selectCls} required defaultValue="">
                      <option value="" disabled>
                        {t('common.select')}
                      </option>
                      {rows.map((r) => (
                        <option key={r.skuId} value={r.skuId}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="tr-from">{t('inv.from')}</Label>
                      <select
                        id="tr-from"
                        name="fromLocationId"
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
                    <div className="space-y-1.5">
                      <Label htmlFor="tr-to">{t('inv.to')}</Label>
                      <select
                        id="tr-to"
                        name="toLocationId"
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
    </Tabs>
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
  const { t, m } = useT();
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
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(error)}
            </p>
          )}
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
  const { t, m, locale } = useT();
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
              <select
                id={`es-family-${sku.id}`}
                name="familyId"
                className={selectCls}
                required
                defaultValue={sku.family_id}
              >
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.name_english ? ` · ${f.name_english}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`es-condition-${sku.id}`}>{t('common.condition')}</Label>
              <select
                id={`es-condition-${sku.id}`}
                name="condition"
                className={selectCls}
                defaultValue={sku.condition}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c][locale]}
                  </option>
                ))}
              </select>
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
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(state.error)}
            </p>
          )}
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

function CreateSkuForm({ families, onDone }: { families: FamilyOpt[]; onDone: () => void }) {
  const { t, m, locale } = useT();
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
          <select
            id="inv-sku-family"
            name="familyId"
            className={selectCls}
            required
            defaultValue=""
          >
            <option value="" disabled>
              {t('common.select')}
            </option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.name_english ? ` · ${f.name_english}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-sku-condition">{t('common.condition')}</Label>
          <select
            id="inv-sku-condition"
            name="condition"
            className={selectCls}
            defaultValue="normal"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c][locale]}
              </option>
            ))}
          </select>
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
      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
          {m(state.error)}
        </p>
      )}
      <SubmitButton>{t('common.save')}</SubmitButton>
    </form>
  );
}
