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
import { confirmSalesOrder, cancelSalesOrder } from '@/lib/actions/sales';
import {
  SO_STATUS_LABELS,
  CURRENCY_LABELS,
  canDeliverAgainst,
  canCancel,
} from '@/lib/domain/sales';
import { formatDateTime, formatDDMMYYYY } from '@/lib/domain/datetime';
import type { SalesOrderRow } from '@/lib/domain/sales-view';
import type { SalesOrderRow as SoRow, StockMovementRow, CustomerRow } from '@/lib/db/types';
import { DeliverForm } from './deliver-form';
import { SoPrint } from './so-print';

const STATUS_VARIANT = {
  draft: 'outline',
  confirmed: 'secondary',
  partially_delivered: 'warning',
  delivered: 'success',
  cancelled: 'destructive',
} as const;

export function SoDetail({
  row,
  so,
  customer,
  locationName,
  deliveries,
  profileName,
  today,
  canManage,
  canOverride,
}: {
  row: SalesOrderRow;
  so: SoRow;
  customer: CustomerRow | null;
  locationName: Record<string, string>;
  deliveries: StockMovementRow[];
  profileName: Record<string, string>;
  today: string;
  canManage: boolean;
  canOverride: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [deliveringItem, setDeliveringItem] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <SoPrint row={row} so={so} customer={customer} locale={locale} />
      <Card className="print:hidden">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {row.soNumber}
              <Badge variant={STATUS_VARIANT[row.status]}>
                {SO_STATUS_LABELS[row.status][locale]}
              </Badge>
              {row.isOverdue && <Badge variant="destructive">{t('sal.overdueBadge')}</Badge>}
            </CardTitle>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              {t('sal.print')}
            </Button>
            {canManage && so.status === 'draft' && (
              <ConfirmActionButton
                action={confirmSalesOrder}
                formData={{ id: so.id }}
                label={t('sal.confirm')}
                confirmText={t('sal.confirmConfirm')}
                onSuccess={() => router.refresh()}
              />
            )}
            {canManage && canCancel(so.status) && (
              <ConfirmActionButton
                action={cancelSalesOrder}
                formData={{ id: so.id }}
                label={t('sal.cancel')}
                confirmText={t('sal.confirmCancel')}
                variant="destructive"
                onSuccess={() => router.refresh()}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground">{t('sal.customer')}</div>
            <div className="font-medium">{row.customerName}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('sal.orderDate')}</div>
            <div>{formatDDMMYYYY(row.orderDate)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('sal.expectedDelivery')}</div>
            <div>{row.expectedDeliveryDate ? formatDDMMYYYY(row.expectedDeliveryDate) : '—'}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('sal.currency')}</div>
            <div>
              {CURRENCY_LABELS[row.currency as keyof typeof CURRENCY_LABELS]?.[locale] ??
                row.currency}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('sal.orderedVsDelivered')}</div>
            <div className="tabular-nums">
              {row.deliveredTotal} / {row.orderedTotal}
            </div>
          </div>
          {so.attachment_path && (
            <div>
              <div className="text-muted-foreground">{t('sal.attachment')}</div>
              <div className="truncate text-xs">{so.attachment_path}</div>
            </div>
          )}
          {so.notes && (
            <div className="sm:col-span-3">
              <div className="text-muted-foreground">{t('common.notes')}</div>
              <div>{so.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-base">{t('sal.lineItems')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inv.specification')}</TableHead>
                <TableHead>{t('common.location')}</TableHead>
                <TableHead className="text-right">{t('sal.orderedQty')}</TableHead>
                <TableHead className="text-right">{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('sal.unitPrice')}</TableHead>
                <TableHead className="text-right">{t('sal.lineTotal')}</TableHead>
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
                      {item.deliveredQty} / {item.orderedQty}
                      {item.outstandingQty > 0 && (
                        <div className="text-xs text-muted-foreground">
                          {t('sal.outstandingQty')}: {item.outstandingQty}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{item.unitPrice}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.lineTotal}</TableCell>
                    {canManage && (
                      <TableCell className="text-right print:hidden">
                        {canDeliverAgainst(so.status as Parameters<typeof canDeliverAgainst>[0]) &&
                          item.outstandingQty > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setDeliveringItem(
                                  deliveringItem === item.itemId ? null : item.itemId,
                                )
                              }
                            >
                              {t('sal.deliverGoods')}
                            </Button>
                          )}
                      </TableCell>
                    )}
                  </TableRow>
                  {deliveringItem === item.itemId && (
                    <TableRow>
                      <TableCell colSpan={canManage ? 7 : 6} className="bg-muted/30">
                        <DeliverForm
                          itemId={item.itemId}
                          outstandingQty={item.outstandingQty}
                          unit={item.unit}
                          today={today}
                          canOverride={canOverride}
                          onDone={() => {
                            setDeliveringItem(null);
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
          <CardTitle className="text-base">{t('sal.deliveryHistory')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.date')}</TableHead>
                <TableHead className="text-right">{t('common.quantity')}</TableHead>
                <TableHead>{t('sal.batchReference')}</TableHead>
                <TableHead>{t('sal.deliveredBy')}</TableHead>
                <TableHead>{t('common.notes')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatDateTime(r.created_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">{-Number(r.quantity)}</TableCell>
                  <TableCell>{r.batch_reference || '—'}</TableCell>
                  <TableCell>{(r.created_by && profileName[r.created_by]) || '—'}</TableCell>
                  <TableCell>{r.notes || '—'}</TableCell>
                </TableRow>
              ))}
              {deliveries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('sal.noDeliveries')}
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
