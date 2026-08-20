'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Fragment, useState } from 'react';
import { FileText } from 'lucide-react';
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
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import { confirmSalesOrder, cancelSalesOrder, removeSalesOrderItem } from '@/lib/actions/sales';
import { markSalesOrderPaid } from '@/lib/actions/payment-receipts';
import {
  SO_STATUS_LABELS,
  CURRENCY_LABELS,
  canDeliverAgainst,
  canCancel,
} from '@/lib/domain/sales';
import {
  SO_PAYMENT_STATUS_LABELS,
  canGenerateDepositInvoice,
  computeSoPaymentStatus,
} from '@/lib/domain/deposit-invoice';
import { formatDateTime, formatDDMMYYYY } from '@/lib/domain/datetime';
import type { SalesOrderRow } from '@/lib/domain/sales-view';
import type {
  SalesOrderRow as SoRow,
  StockMovementRow,
  DepositInvoiceRow,
  QuotationRow,
  QuotationItemRow,
} from '@/lib/db/types';
import { DeliverForm } from './deliver-form';
import { GenerateDepositInvoiceDialog } from './generate-deposit-invoice-dialog';
import { PrintDepositInvoiceButton } from './print-deposit-invoice-button';
import { AddSoItemDialog } from './add-so-item-dialog';

const STATUS_VARIANT = {
  draft: 'outline',
  confirmed: 'secondary',
  partially_delivered: 'warning',
  delivered: 'success',
  cancelled: 'destructive',
} as const;

const DEPOSIT_STATUS_VARIANT = {
  pending_deposit: 'warning',
  partially_paid: 'secondary',
  paid: 'success',
  void: 'destructive',
} as const;

export function SoDetail({
  row,
  so,
  locationName,
  deliveries,
  profileName,
  today,
  canManage,
  canOverride,
  depositInvoice,
  sourceQuotation,
  sourceQuotationItems,
  skuOptions,
}: {
  row: SalesOrderRow;
  so: SoRow;
  locationName: Record<string, string>;
  deliveries: StockMovementRow[];
  profileName: Record<string, string>;
  today: string;
  canManage: boolean;
  canOverride: boolean;
  depositInvoice: DepositInvoiceRow | null;
  /** Set when this order was auto-created from a Quotation's paid deposit. */
  sourceQuotation: QuotationRow | null;
  sourceQuotationItems: QuotationItemRow[];
  skuOptions: { id: string; unit: string; label: string }[];
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [deliveringItem, setDeliveringItem] = useState<string | null>(null);
  const locations = Object.entries(locationName).map(([id, name]) => ({ id, name }));

  const soPaymentStatus = computeSoPaymentStatus(
    !!depositInvoice,
    so.deposit_paid_on,
    so.balance_paid_on,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {row.soNumber}
              <Badge variant={STATUS_VARIANT[row.status]}>
                {SO_STATUS_LABELS[row.status][locale]}
              </Badge>
              {soPaymentStatus !== 'none' && (
                <Badge variant={DEPOSIT_STATUS_VARIANT[soPaymentStatus]}>
                  {SO_PAYMENT_STATUS_LABELS[soPaymentStatus][locale]}
                </Badge>
              )}
              {row.isOverdue && <Badge variant="destructive">{t('sal.overdueBadge')}</Badge>}
            </CardTitle>
            {sourceQuotation && (
              <div className="mt-1 text-xs text-muted-foreground">
                {t('sal.createdFromQuotation')}{' '}
                <Link
                  href={`/sales/quotations`}
                  className="text-primary underline underline-offset-2"
                >
                  {sourceQuotation.quotation_no ?? sourceQuotation.id.slice(0, 8)}
                </Link>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/sales/orders/${so.id}/pdf`} target="_blank" rel="noopener noreferrer">
                <FileText className="h-4 w-4" /> {t('sal.print')}
              </a>
            </Button>
            {canManage && canGenerateDepositInvoice(so.status, !!depositInvoice) && (
              <GenerateDepositInvoiceDialog
                soId={so.id}
                grandTotal={row.grandTotal}
                currency={row.currency}
                onGenerated={() => router.refresh()}
              />
            )}
            {canManage && so.status === 'draft' && (
              <AddSoItemDialog
                salesOrderId={so.id}
                locations={locations}
                skuOptions={skuOptions}
                onAdded={() => router.refresh()}
              />
            )}
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

      {depositInvoice && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              {depositInvoice.invoice_number}
              {soPaymentStatus !== 'none' && (
                <Badge variant={DEPOSIT_STATUS_VARIANT[soPaymentStatus]}>
                  {SO_PAYMENT_STATUS_LABELS[soPaymentStatus][locale]}
                </Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <PrintDepositInvoiceButton invoice={depositInvoice} kind="deposit" />
              <PrintDepositInvoiceButton invoice={depositInvoice} kind="balance" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">{t('sal.totalOrderAmount')}</div>
              <div className="tabular-nums">
                {depositInvoice.currency} {depositInvoice.total_order_amount.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('sal.depositPercentage')}</div>
              <div className="tabular-nums">{depositInvoice.deposit_percentage}%</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('sal.depositAmount')}</div>
              <div className="font-medium tabular-nums">
                {depositInvoice.currency} {depositInvoice.deposit_amount.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">{t('sal.remainingBalance')}</div>
              <div className="tabular-nums">
                {depositInvoice.currency} {depositInvoice.remaining_balance.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div>
                <div className="text-muted-foreground">{t('sal.depositPaid')}</div>
                <div className="font-medium">
                  {so.deposit_paid_on ? (
                    <span>
                      {t('sal.depositPaidOn')} {formatDDMMYYYY(so.deposit_paid_on)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t('sal.depositPending')}</span>
                  )}
                </div>
              </div>
              {canManage && !so.deposit_paid_on && (
                <ActionForm action={markSalesOrderPaid} className="space-y-0">
                  <input type="hidden" name="id" value={so.id} />
                  <input type="hidden" name="which" value="deposit" />
                  <SubmitButton variant="outline" size="sm">
                    {t('sal.markDepositPaid')}
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div>
                <div className="text-muted-foreground">{t('sal.balanceDue')}</div>
                <div className="font-medium">
                  {so.balance_paid_on ? (
                    <span>
                      {t('sal.balancePaidOn')} {formatDDMMYYYY(so.balance_paid_on)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t('sal.balancePending')}</span>
                  )}
                </div>
              </div>
              {canManage && !so.balance_paid_on && (
                <ActionForm action={markSalesOrderPaid} className="space-y-0">
                  <input type="hidden" name="id" value={so.id} />
                  <input type="hidden" name="which" value="balance" />
                  <SubmitButton variant="outline" size="sm">
                    {t('sal.markBalancePaid')}
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {sourceQuotation && sourceQuotationItems.length > 0 && row.items.length === 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">{t('sal.quotationRefTitle')}</CardTitle>
            <p className="text-xs text-muted-foreground">{t('sal.quotationRefHint')}</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('quo.description')}</TableHead>
                  <TableHead>{t('quo.wireDia')}</TableHead>
                  <TableHead>{t('quo.steelGrade')}</TableHead>
                  <TableHead className="text-right">{t('quo.quantity')}</TableHead>
                  <TableHead className="text-right">{t('quo.unitPrice')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceQuotationItems.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.description}</TableCell>
                    <TableCell>{it.wire_dia || '—'}</TableCell>
                    <TableCell>{it.steel_grade || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {it.quantity} {it.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{it.unit_price}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
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
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
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
                      <TableCell className="text-right">
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
                        {so.status === 'draft' && (
                          <ConfirmActionButton
                            action={removeSalesOrderItem}
                            formData={{ itemId: item.itemId, salesOrderId: so.id }}
                            label={t('common.delete')}
                            confirmText={t('sal.confirmRemoveItem')}
                            variant="destructive"
                            onSuccess={() => router.refresh()}
                          />
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

      <Card>
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
