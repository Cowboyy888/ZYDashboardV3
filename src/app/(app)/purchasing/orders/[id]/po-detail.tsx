'use client';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmActionButton } from '@/components/forms/confirm-action-button';
import { useT } from '@/components/i18n-provider';
import {
  issuePurchaseOrder,
  cancelPurchaseOrder,
  removePurchaseOrderItem,
} from '@/lib/actions/purchasing';
import {
  PO_STATUS_LABELS,
  CURRENCY_LABELS,
  canCancel,
  type Currency,
} from '@/lib/domain/purchasing';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { PurchaseOrderRow } from '@/lib/domain/purchasing-view';
import type { PurchaseOrderRow as PoRow } from '@/lib/db/types';
import { EditPoDialog } from './edit-po-dialog';
import { AddPoItemDialog } from './add-po-item-dialog';

const STATUS_VARIANT = {
  draft: 'outline',
  ordered: 'secondary',
  cancelled: 'destructive',
} as const;

export function PoDetail({
  row,
  po,
  suppliers,
  locationName,
  skuOptions,
  families,
  canManage,
  canCreateSpec,
}: {
  row: PurchaseOrderRow;
  po: PoRow;
  suppliers: { id: string; name: string }[];
  locationName: Record<string, string>;
  skuOptions: { id: string; unit: string; label: string }[];
  families: { id: string; name: string; nameEnglish: string | null }[];
  canManage: boolean;
  canCreateSpec: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const locations = Object.entries(locationName).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {row.poNumber}
              <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>
                {PO_STATUS_LABELS[row.status]?.[locale] ?? row.status}
              </Badge>
            </CardTitle>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              {t('pur.print')}
            </Button>
            {canManage && po.status === 'draft' && (
              <EditPoDialog
                poId={po.id}
                supplierId={po.supplier_id}
                currency={row.currency as Currency}
                orderDate={po.order_date}
                notes={po.notes}
                suppliers={suppliers}
                onSaved={() => router.refresh()}
              />
            )}
            {canManage && po.status === 'draft' && (
              <AddPoItemDialog
                purchaseOrderId={po.id}
                locations={locations}
                skuOptions={skuOptions}
                families={families}
                canCreateSpec={canCreateSpec}
                onAdded={() => router.refresh()}
              />
            )}
            {canManage && po.status === 'draft' && (
              <ConfirmActionButton
                action={issuePurchaseOrder}
                formData={{ id: po.id }}
                label={t('pur.issue')}
                confirmText={t('pur.confirmIssue')}
                onSuccess={() => router.refresh()}
              />
            )}
            {canManage && canCancel(po.status) && (
              <ConfirmActionButton
                action={cancelPurchaseOrder}
                formData={{ id: po.id }}
                label={t('pur.cancel')}
                confirmText={t('pur.confirmCancel')}
                variant="destructive"
                onSuccess={() => router.refresh()}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground">{t('pur.supplier')}</div>
            <div className="font-medium">{row.supplierName}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pur.orderDate')}</div>
            <div>{formatDDMMYYYY(row.orderDate)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pur.currency')}</div>
            <div>
              {CURRENCY_LABELS[row.currency as keyof typeof CURRENCY_LABELS]?.[locale] ??
                row.currency}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pur.grandTotal')}</div>
            <div className="font-medium tabular-nums">
              {row.currency} {row.grandTotal.toFixed(2)}
            </div>
          </div>
          {po.attachment_path && (
            <div>
              <div className="text-muted-foreground">{t('pur.attachment')}</div>
              <div className="truncate text-xs">{po.attachment_path}</div>
            </div>
          )}
          {po.notes && (
            <div className="sm:col-span-3">
              <div className="text-muted-foreground">{t('common.notes')}</div>
              <div>{po.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pur.lineItems')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inv.specification')}</TableHead>
                <TableHead>{t('common.location')}</TableHead>
                <TableHead className="text-right">{t('pur.orderedQty')}</TableHead>
                <TableHead className="text-right">{t('pur.unitCost')}</TableHead>
                <TableHead className="text-right">{t('pur.lineTotal')}</TableHead>
                {canManage && po.status === 'draft' && (
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.items.map((item) => (
                <TableRow key={item.itemId}>
                  <TableCell className="max-w-[320px]">
                    <span className="truncate">{item.skuLabel}</span>
                  </TableCell>
                  <TableCell>{locationName[item.locationId] ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.orderedQty} {item.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.unitCost}</TableCell>
                  <TableCell className="text-right tabular-nums">{item.lineTotal}</TableCell>
                  {canManage && po.status === 'draft' && (
                    <TableCell className="text-right">
                      <ConfirmActionButton
                        action={removePurchaseOrderItem}
                        formData={{ itemId: item.itemId, purchaseOrderId: po.id }}
                        label={t('common.delete')}
                        confirmText={t('pur.confirmRemoveItem')}
                        variant="destructive"
                        onSuccess={() => router.refresh()}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {row.items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage && po.status === 'draft' ? 6 : 5}
                    className="text-center text-muted-foreground"
                  >
                    {t('pur.noItems')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
