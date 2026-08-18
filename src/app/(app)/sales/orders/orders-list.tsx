'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/components/i18n-provider';
import { SO_STATUS_LABELS, type SoStatus } from '@/lib/domain/sales';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import type { SalesOrderRow } from '@/lib/domain/sales-view';

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

export function OrdersList({ rows }: { rows: SalesOrderRow[] }) {
  const { t, locale } = useT();
  const [query, setQuery] = useState('');

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.soNumber, r.customerName, formatDDMMYYYY(r.orderDate)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-80">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('sal.searchOrders')}
          className="h-9 pl-8"
        />
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('sal.soNumber')}</TableHead>
                <TableHead>{t('sal.customer')}</TableHead>
                <TableHead>{t('sal.orderDate')}</TableHead>
                <TableHead>{t('sal.expectedDelivery')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('sal.orderedVsDelivered')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r) => (
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
                  <TableCell>{formatDDMMYYYY(r.orderDate)}</TableCell>
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
              {visibleRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {rows.length === 0 ? t('sal.noOrders') : t('sal.noOrdersMatch')}
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
