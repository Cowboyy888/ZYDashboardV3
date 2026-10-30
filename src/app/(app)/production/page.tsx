import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getProductionOrders } from '@/lib/db/queries';
import {
  PRODUCTION_STATUSES,
  productionCalculation,
  productionOverdue,
} from '@/lib/domain/production-orders';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
  TableBody,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const user = await requirePermission('production:view');
  const t = translator(await getLocale());
  const params = await searchParams;
  const page = Math.max(1, Math.min(100000, Number(params.page) || 1)) | 0;
  const status = PRODUCTION_STATUSES.find((s) => s === params.status) ?? '';
  const result = await getProductionOrders(page, status);
  const href = (p: number) => `/production?${new URLSearchParams({ page: String(p), status })}`;
  return (
    <div>
      <PageHeader
        title={t('production.title')}
        description={t('production.scope')}
        actions={
          hasPermission(user.role, 'production:manage') && (
            <Button asChild>
              <Link href="/production/new">{t('production.new')}</Link>
            </Button>
          )
        }
      />
      <form className="mb-4 flex gap-2" action="/production">
        <NativeSelect name="status" aria-label={t('common.status')} defaultValue={status}>
          <option value="">{t('common.all')}</option>
          {PRODUCTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`production.status.${s}`)}
            </option>
          ))}
        </NativeSelect>
        <Button variant="outline">{t('production.filter')}</Button>
      </form>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {(['number', 'source', 'sku', 'quantity', 'area', 'required', 'status'] as const).map(
                (key) => (
                  <TableHead key={key}>{t(`production.${key}`)}</TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link
                    className="font-medium text-primary underline"
                    href={`/production/${row.id}`}
                  >
                    {row.order_number}
                  </Link>
                </TableCell>
                <TableCell>
                  {row.sales_order_number ?? t('production.internal')}
                  <div className="text-xs text-muted-foreground">{row.customer_reference}</div>
                </TableCell>
                <TableCell>{row.sku_label}</TableCell>
                <TableCell>{row.planned_quantity} 张</TableCell>
                <TableCell>
                  {productionCalculation(
                    row.geometry,
                    row.planned_quantity,
                  ).totalAreaM2.toLocaleString()}{' '}
                  m²
                </TableCell>
                <TableCell>
                  {formatDDMMYYYY(row.required_date)}
                  {productionOverdue(row.status, row.required_date, businessDate()) && (
                    <Badge variant="warning">{t('production.overdue')}</Badge>
                  )}
                </TableCell>
                <TableCell>{t(`production.status.${row.status}`)}</TableCell>
              </TableRow>
            ))}
            {!result.rows.length && (
              <TableRow>
                <TableCell colSpan={7}>{t('production.empty')}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <span>{result.total}</span>
        {page > 1 && <Link href={href(page - 1)}>{t('production.previous')}</Link>}
        {page * 20 < result.total && <Link href={href(page + 1)}>{t('production.next')}</Link>}
      </div>
    </div>
  );
}
