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
import type { PurchaseOrderRow } from '@/lib/domain/purchasing-view';

const STATUS_VARIANT: Record<PoStatus, 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  ordered: 'secondary',
  cancelled: 'destructive',
};

export function PurchasingDashboard({ rows }: { rows: PurchaseOrderRow[] }) {
  const { t, locale } = useT();

  const open = rows.filter((r) => r.status === 'ordered');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t('pur.openOrders')} value={open.length} tone="primary" />
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
                <TableHead>{t('common.status')}</TableHead>
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
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>
                      {PO_STATUS_LABELS[r.status]?.[locale] ?? r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {open.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t('pur.noOpenOrders')}
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
