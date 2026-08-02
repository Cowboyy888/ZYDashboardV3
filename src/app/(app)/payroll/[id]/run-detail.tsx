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
import { approvePayrollRun, markPayrollRunPaid, cancelPayrollRun } from '@/lib/actions/payroll';
import {
  PAYROLL_STATUS_LABELS,
  canApproveRun,
  canMarkPaid,
  canCancelRun,
  canEditRun,
} from '@/lib/domain/payroll';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { PayrollRunRow } from '@/lib/domain/payroll-view';
import { ItemLines } from './item-lines';
import { EditRunDialog } from './edit-run-dialog';

const STATUS_VARIANT = {
  draft: 'outline',
  approved: 'warning',
  paid: 'success',
  cancelled: 'destructive',
} as const;

export function RunDetail({
  row,
  canManage,
  canApprove,
}: {
  row: PayrollRunRow;
  canManage: boolean;
  canApprove: boolean;
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Badge variant={STATUS_VARIANT[row.status]}>
              {PAYROLL_STATUS_LABELS[row.status][locale]}
            </Badge>
          </CardTitle>
          <div className="flex gap-2 print:hidden">
            {canManage && canEditRun(row.status) && (
              <EditRunDialog
                runId={row.runId}
                periodStart={row.periodStart}
                periodEnd={row.periodEnd}
                payDate={row.payDate}
                notes={row.notes}
                onSaved={() => router.refresh()}
              />
            )}
            {canApprove && canApproveRun(row.status) && (
              <ConfirmActionButton
                action={approvePayrollRun}
                formData={{ id: row.runId }}
                label={t('pay.approve')}
                confirmText={t('pay.confirmApprove')}
                onSuccess={() => router.refresh()}
              />
            )}
            {canManage && canMarkPaid(row.status) && (
              <ConfirmActionButton
                action={markPayrollRunPaid}
                formData={{ id: row.runId }}
                label={t('pay.markPaid')}
                confirmText={t('pay.confirmMarkPaid')}
                onSuccess={() => router.refresh()}
              />
            )}
            {canManage && canCancelRun(row.status) && (
              <ConfirmActionButton
                action={cancelPayrollRun}
                formData={{ id: row.runId }}
                label={t('pay.cancel')}
                confirmText={t('pay.confirmCancel')}
                variant="destructive"
                onSuccess={() => router.refresh()}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">{t('pay.period')}</div>
            <div className="font-medium">
              {formatDDMMYYYY(row.periodStart)} – {formatDDMMYYYY(row.periodEnd)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pay.payDate')}</div>
            <div>{formatDDMMYYYY(row.payDate)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pay.grossTotal')}</div>
            <div className="tabular-nums">${row.grossTotal.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">{t('pay.netTotal')}</div>
            <div className="font-semibold tabular-nums">${row.netTotal.toFixed(2)}</div>
          </div>
          {row.notes && (
            <div className="sm:col-span-4">
              <div className="text-muted-foreground">{t('common.notes')}</div>
              <div>{row.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pay.payslips')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pay.employee')}</TableHead>
                <TableHead>{t('pay.payType')}</TableHead>
                <TableHead className="text-right">{t('pay.daysWorked')}</TableHead>
                <TableHead className="text-right">{t('pay.baseAmount')}</TableHead>
                <TableHead className="text-right">{t('pay.deductions')}</TableHead>
                <TableHead className="text-right">{t('pay.netAmount')}</TableHead>
                {canManage && canEditRun(row.status) && (
                  <TableHead className="text-right print:hidden">{t('common.actions')}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {row.items.map((item) => (
                <Fragment key={item.itemId}>
                  <TableRow>
                    <TableCell>
                      {item.employeeName}
                      <div className="text-xs text-muted-foreground">{item.employeeCode}</div>
                    </TableCell>
                    <TableCell>{t('pay.daily')}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.daysWorked ?? 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${item.baseAmount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-warning">
                      {item.deductionsTotal > 0 ? `-$${item.deductionsTotal.toFixed(2)}` : '—'}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      ${item.netAmount.toFixed(2)}
                    </TableCell>
                    {canManage && canEditRun(row.status) && (
                      <TableCell className="text-right print:hidden">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setExpandedItem(expandedItem === item.itemId ? null : item.itemId)
                          }
                        >
                          {t('pay.manageLines')}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                  {expandedItem === item.itemId && (
                    <TableRow>
                      <TableCell colSpan={canManage ? 7 : 6} className="bg-muted/30">
                        <ItemLines
                          runId={row.runId}
                          itemId={item.itemId}
                          lines={item.lines}
                          onDone={() => router.refresh()}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
              {row.items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 7 : 6}
                    className="text-center text-muted-foreground"
                  >
                    {t('pay.noItems')}
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
