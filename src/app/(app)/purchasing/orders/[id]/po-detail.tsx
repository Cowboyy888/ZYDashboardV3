'use client';
import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
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
import { issuePurchaseOrder, cancelPurchaseOrder } from '@/lib/actions/purchasing';
import {
  PO_STATUS_LABELS,
  CURRENCY_LABELS,
  canReceiveAgainst,
  canCancel,
} from '@/lib/domain/purchasing';
import { formatDateTime, formatDDMMYYYY } from '@/lib/domain/datetime';
import type { PurchaseOrderRow } from '@/lib/domain/purchasing-view';
import type { PurchaseOrderRow as PoRow, StockMovementRow } from '@/lib/db/types';
import { ReceiveForm } from './receive-form';

const STATUS_VARIANT = {
  draft: 'outline',
  ordered: 'secondary',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'destructive',
} as const;

export function PoDetail({
  row,
  po,
  locationName,
  receipts,
  profileName,
  today,
  canManage,
  canOverride,
}: {
  row: PurchaseOrderRow;
  po: PoRow;
  locationName: Record<string, string>;
  receipts: StockMovementRow[];
  profileName: Record<string, string>;
  today: string;
  canManage: boolean;
  canOverride: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [receivingItem, setReceivingItem] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {row.poNumber}
              <Badge variant={STATUS_VARIANT[row.status]}>
                {PO_STATUS_LABELS[row.status][locale]}
              </Badge>
              {row.isOverdue && <Badge variant="destructive">{t('pur.overdueBadge')}</Badge>}
            </CardTitle>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              {t('pur.print')}
            </Button>
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
            <div className="text-muted-foreground">{t('pur.expectedArrival')}</div>
            <div>{row.expectedArrivalDate ? formatDDMMYYYY(row.expectedArrivalDate) : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pur.currency')}</div>
            <div>
              {CURRENCY_LABELS[row.currency as keyof typeof CURRENCY_LABELS]?.[locale] ??
                row.currency}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pur.orderedVsReceived')}</div>
            <div className="tabular-nums">
              {row.receivedTotal} / {row.orderedTotal}
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
                <TableHead className="text-right">{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('pur.unitCost')}</TableHead>
                <TableHead className="text-right">{t('pur.lineTotal')}</TableHead>
                {canManage && (
                  <TableHead className="text-right print:hidden">{t('common.actions')}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.items.map((item) => (
                <Fragment key={item.itemId}>
                  <TableRow>
                    <TableCell className="max-w-[320px]">
                      <span className="truncate">{item.skuLabel}</span>
                    </TableCell>
                    <TableCell>{locationName[item.locationId] ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.orderedQty} {item.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.receivedQty} / {item.orderedQty}
                      {item.outstandingQty > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t('pur.outstandingQty')}: {item.outstandingQty}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.unitCost}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.lineTotal}</TableCell>
                    {canManage && (
                      <TableCell className="text-right print:hidden">
                        {canReceiveAgainst(po.status as Parameters<typeof canReceiveAgainst>[0]) &&
                          item.outstandingQty > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setReceivingItem(receivingItem === item.itemId ? null : item.itemId)
                              }
                            >
                              {t('pur.receiveGoods')}
                            </Button>
                          )}
                      </TableCell>
                    )}
                  </TableRow>
                  {receivingItem === item.itemId && (
                    <TableRow>
                      <TableCell colSpan={canManage ? 7 : 6} className="bg-muted/30">
                        <ReceiveForm
                          itemId={item.itemId}
                          outstandingQty={item.outstandingQty}
                          unit={item.unit}
                          today={today}
                          canOverride={canOverride}
                          onDone={() => {
                            setReceivingItem(null);
                            router.refresh();
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">{t('pur.receiptHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.date')}</TableHead>
                <TableHead className="text-right">{t('common.quantity')}</TableHead>
                <TableHead>{t('pur.batchReference')}</TableHead>
                <TableHead>{t('pur.receivedBy')}</TableHead>
                <TableHead>{t('common.notes')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                  <TableCell>{r.batch_reference || '—'}</TableCell>
                  <TableCell>{(r.created_by && profileName[r.created_by]) || '—'}</TableCell>
                  <TableCell>{r.notes || '—'}</TableCell>
                </TableRow>
              ))}
              {receipts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('pur.noReceipts')}
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
