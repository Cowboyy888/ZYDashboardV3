'use client';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/components/i18n-provider';
import { PO_STATUS_LABELS, type PoStatus } from '@/lib/domain/purchasing';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { PurchaseOrderRow } from '@/lib/domain/purchasing-view';

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

export function OrdersList({ rows }: { rows: PurchaseOrderRow[] }) {
  const { t, locale } = useT();
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('pur.poNumber')}</TableHead>
              <TableHead>{t('pur.supplier')}</TableHead>
              <TableHead>{t('pur.orderDate')}</TableHead>
              <TableHead>{t('pur.expectedArrival')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">{t('pur.orderedVsReceived')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
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
                <TableCell>{formatDDMMYYYY(r.orderDate)}</TableCell>
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
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  {t('pur.noOrders')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
