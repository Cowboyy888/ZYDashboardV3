'use client';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmActionButton } from '@/components/forms/confirm-action-button';
import { useT } from '@/components/i18n-provider';
import { issuePurchaseOrder, cancelPurchaseOrder } from '@/lib/actions/purchasing';
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

const STATUS_VARIANT = {
  draft: 'outline',
  ordered: 'secondary',
  cancelled: 'destructive',
} as const;

export function PoDetail({
  row,
  po,
  suppliers,
  canManage,
}: {
  row: PurchaseOrderRow;
  po: PoRow;
  suppliers: { id: string; name: string }[];
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
    </div>
  );
}
