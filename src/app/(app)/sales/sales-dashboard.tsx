'use client';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/stat-card';
import { useT } from '@/components/i18n-provider';
import { SO_STATUS_LABELS, type SoStatus } from '@/lib/domain/sales';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { SalesOrderRow, CommittedStockRow } from '@/lib/domain/sales-view';

const STATUS_VARIANT: Record<
  SoStatus,
  'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  confirmed: 'secondary',
  partially_delivered: 'warning',
  delivered: 'success',
  cancelled: 'destructive',
};

export function SalesDashboard({
  rows,
  committedRows,
}: {
  rows: SalesOrderRow[];
  committedRows: CommittedStockRow[];
}) {
  const { t, locale } = useT();

  const open = rows.filter((r) => r.status === 'confirmed' || r.status === 'partially_delivered');
  const dueThisWeek = open.filter((r) => r.isDueThisWeek);
  const overdue = open.filter((r) => r.isOverdue);
  const partiallyDelivered = rows.filter((r) => r.status === 'partially_delivered');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('sal.openOrders')} value={open.length} tone="primary" />
        <StatCard label={t('sal.dueThisWeek')} value={dueThisWeek.length} tone="warning" />
        <StatCard
          label={t('sal.overdue')}
          value={overdue.length}
          tone={overdue.length > 0 ? 'destructive' : 'success'}
        />
        <StatCard label={t('sal.partiallyDelivered')} value={partiallyDelivered.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sal.openOrders')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sal.soNumber')}</TableHead>
                <TableHead>{t('sal.customer')}</TableHead>
                <TableHead>{t('sal.expectedDelivery')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('sal.orderedVsDelivered')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((r) => (
                <TableRow key={r.soId}>
                  <TableCell>
                    <Link
                      href={`/sales/orders/${r.soId}`}
                      className="font-medium text-primary underline"
                    >
                      {r.soNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{r.customerName}</TableCell>
                  <TableCell>
                    {r.expectedDeliveryDate ? formatDDMMYYYY(r.expectedDeliveryDate) : '—'}
                    {r.isOverdue && (
                      <Badge variant="destructive" className="ml-2">
                        {t('sal.overdueBadge')}
                      </Badge>
                    )}
                    {!r.isOverdue && r.isDueThisWeek && (
                      <Badge variant="warning" className="ml-2">
                        {t('sal.dueThisWeekBadge')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>
                      {SO_STATUS_LABELS[r.status][locale]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.deliveredTotal} / {r.orderedTotal}
                  </TableCell>
                </TableRow>
              ))}
              {open.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('sal.noOpenOrders')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('sal.committedStock')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <p className="px-4 pt-2 text-xs text-muted-foreground">{t('sal.committedNote')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inv.specification')}</TableHead>
                <TableHead className="text-right">{t('sal.physicalStock')}</TableHead>
                <TableHead className="text-right">{t('sal.outstandingOrdered')}</TableHead>
                <TableHead className="text-right">{t('sal.committedStock')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {committedRows.map((r) => (
                <TableRow key={r.skuId}>
                  <TableCell className="max-w-[320px]">
                    <span className="truncate">{r.skuLabel}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.physicalStock} {r.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-warning">
                    -{r.outstandingOrdered} {r.unit}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold tabular-nums ${r.committedStock < 0 ? 'text-destructive' : ''}`}
                  >
                    {r.committedStock} {r.unit}
                  </TableCell>
                </TableRow>
              ))}
              {committedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('sal.noCommitted')}
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
