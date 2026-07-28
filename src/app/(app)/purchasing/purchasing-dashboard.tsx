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
import { PO_STATUS_LABELS, type PoStatus } from '@/lib/domain/purchasing';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { PurchaseOrderRow, ProjectedStockRow } from '@/lib/domain/purchasing-view';

const STATUS_VARIANT: Record<
  PoStatus,
  'secondary' | 'success' | 'warning' | 'destructive' | 'outline'
> = {
  draft: 'outline',
  ordered: 'secondary',
  partially_received: 'warning',
  received: 'success',
  cancelled: 'destructive',
};

export function PurchasingDashboard({
  rows,
  projectedRows,
}: {
  rows: PurchaseOrderRow[];
  projectedRows: ProjectedStockRow[];
}) {
  const { t, locale } = useT();

  const open = rows.filter((r) => r.status === 'ordered' || r.status === 'partially_received');
  const dueThisWeek = open.filter((r) => r.isDueThisWeek);
  const overdue = open.filter((r) => r.isOverdue);
  const partiallyReceived = rows.filter((r) => r.status === 'partially_received');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('pur.openOrders')} value={open.length} tone="primary" />
        <StatCard label={t('pur.dueThisWeek')} value={dueThisWeek.length} tone="warning" />
        <StatCard
          label={t('pur.overdue')}
          value={overdue.length}
          tone={overdue.length > 0 ? 'destructive' : 'success'}
        />
        <StatCard label={t('pur.partiallyReceived')} value={partiallyReceived.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pur.openOrders')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('pur.poNumber')}</TableHead>
                <TableHead>{t('pur.supplier')}</TableHead>
                <TableHead>{t('pur.expectedArrival')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('pur.orderedVsReceived')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {open.map((r) => (
                <TableRow key={r.poId}>
                  <TableCell>
                    <Link
                      href={`/purchasing/orders/${r.poId}`}
                      className="font-medium text-primary underline"
                    >
                      {r.poNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{r.supplierName}</TableCell>
                  <TableCell>
                    {r.expectedArrivalDate ? formatDDMMYYYY(r.expectedArrivalDate) : '—'}
                    {r.isOverdue && (
                      <Badge variant="destructive" className="ml-2">
                        {t('pur.overdueBadge')}
                      </Badge>
                    )}
                    {!r.isOverdue && r.isDueThisWeek && (
                      <Badge variant="warning" className="ml-2">
                        {t('pur.dueThisWeekBadge')}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]}>
                      {PO_STATUS_LABELS[r.status][locale]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.receivedTotal} / {r.orderedTotal}
                  </TableCell>
                </TableRow>
              ))}
              {open.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('pur.noOpenOrders')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('pur.projectedStock')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-0">
          <p className="px-4 pt-2 text-xs text-muted-foreground">{t('pur.projectedNote')}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inv.specification')}</TableHead>
                <TableHead className="text-right">{t('pur.physicalStock')}</TableHead>
                <TableHead className="text-right">{t('pur.outstandingOrdered')}</TableHead>
                <TableHead className="text-right">{t('pur.projectedStock')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectedRows.map((r) => (
                <TableRow key={r.skuId}>
                  <TableCell className="max-w-[320px]">
                    <span className="truncate">{r.skuLabel}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.physicalStock} {r.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-warning">
                    +{r.outstandingOrdered} {r.unit}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {r.projectedStock} {r.unit}
                  </TableCell>
                </TableRow>
              ))}
              {projectedRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('pur.noProjected')}
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
