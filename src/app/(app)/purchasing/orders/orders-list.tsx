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

const STATUS_VARIANT: Record<PoStatus, 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  ordered: 'secondary',
  cancelled: 'destructive',
};

export function OrdersList({
  rows,
  productsByPo,
}: {
  rows: PurchaseOrderRow[];
  productsByPo: Record<string, string[]>;
}) {
  const { t, locale } = useT();

  function productsPreview(poId: string): string {
    const names = productsByPo[poId] ?? [];
    if (names.length === 0) return '—';
    if (names.length === 1) return names[0]!;
    return `${names[0]} +${names.length - 1} ${t('pur.moreProducts')}`;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('pur.poNumber')}</TableHead>
              <TableHead>{t('pur.supplier')}</TableHead>
              <TableHead>{t('pur.orderDate')}</TableHead>
              <TableHead>{t('pur.products')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
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
                <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">
                  {productsPreview(r.poId)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[r.status] ?? 'outline'}>
                    {PO_STATUS_LABELS[r.status]?.[locale] ?? r.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
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
