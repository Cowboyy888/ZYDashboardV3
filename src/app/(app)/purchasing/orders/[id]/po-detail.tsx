'use client';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
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
  removePurchaseOrderManualItem,
} from '@/lib/actions/purchasing';
import {
  PO_STATUS_LABELS,
  CURRENCY_LABELS,
  canCancel,
  type Currency,
} from '@/lib/domain/purchasing';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { PurchaseOrderRow } from '@/lib/domain/purchasing-view';
import type { PurchaseOrderRow as PoRow, PurchaseOrderManualItemRow } from '@/lib/db/types';
import { EditPoDialog } from './edit-po-dialog';
import { AddPoManualItemDialog } from './add-po-manual-item-dialog';

const STATUS_VARIANT = {
  draft: 'outline',
  ordered: 'secondary',
  cancelled: 'destructive',
} as const;

export function PoDetail({
  row,
  po,
  suppliers,
  manualItems,
  canManage,
}: {
  row: PurchaseOrderRow;
  po: PoRow;
  suppliers: { id: string; name: string }[];
  manualItems: PurchaseOrderManualItemRow[];
  canManage: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();

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
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/purchasing/orders/${po.id}/pdf`}>
                <Download className="h-4 w-4" /> {t('pur.print')}
              </a>
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
            {canManage && (
              <AddPoManualItemDialog purchaseOrderId={po.id} onAdded={() => router.refresh()} />
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
          <CardTitle className="text-base">{t('pur.products')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pur.productName')}</TableHead>
                <TableHead className="text-right">{t('pur.orderedQty')}</TableHead>
                <TableHead>{t('common.unit')}</TableHead>
                <TableHead className="text-right">{t('pur.unitCost')}</TableHead>
                <TableHead className="text-right">{t('pur.lineTotal')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {manualItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="max-w-[320px]">
                    <span className="truncate">{item.product_name}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{item.quantity ?? '—'}</TableCell>
                  <TableCell>{item.unit ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.unit_price ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {item.line_total ?? '—'}
                  </TableCell>
                  {canManage && (
                    <TableCell className="text-right">
                      <ConfirmActionButton
                        action={removePurchaseOrderManualItem}
                        formData={{ itemId: item.id, purchaseOrderId: po.id }}
                        label={t('common.delete')}
                        confirmText={t('pur.confirmRemoveProduct')}
                        variant="destructive"
                        onSuccess={() => router.refresh()}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {manualItems.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 6 : 5}
                    className="text-center text-muted-foreground"
                  >
                    {t('pur.noProducts')}
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
