import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getSalesOrdersPage,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomers,
  getSkus,
  getFamilies,
  DEFAULT_PAGE_SIZE,
} from '@/lib/db/queries';
import { buildSalesOrderRows } from '@/lib/domain/sales-view';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { SearchBox } from '@/components/ui/search-box';
import { Pagination } from '@/components/ui/pagination';
import { SalesNav } from '../sales-nav';
import { OrdersList } from './orders-list';

export const dynamic = 'force-dynamic';

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requirePermission('sales:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { rows: sos, total } = await getSalesOrdersPage({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    search: q,
  });
  const soIds = sos.map((so) => so.id);

  const [items, customers] = await Promise.all([
    getSalesOrderItems(soIds),
    getCustomers(true, Array.from(new Set(sos.map((so) => so.customer_id)))),
  ]);
  const skus = await getSkus(true, Array.from(new Set(items.map((it) => it.sku_id))));
  const [families, delivered] = await Promise.all([
    getFamilies(true, Array.from(new Set(skus.map((s) => s.family_id)))),
    getSalesOrderItemsDelivered(items.map((it) => it.id)),
  ]);

  const rows = buildSalesOrderRows(
    sos,
    items,
    delivered,
    customers,
    skus,
    families,
    businessDate(),
    locale,
  );

  return (
    <div>
      <PageHeader
        title={t('sal.orders')}
        description={t('sal.dashDesc')}
        actions={
          <>
            <a href="/api/export/sales" className={buttonVariants({ variant: 'outline' })}>
              {t('common.exportExcel')}
            </a>
            {hasPermission(user.role, 'sales:manage') && (
              <Link href="/sales/orders/new" className={buttonVariants()}>
                {t('sal.newSo')}
              </Link>
            )}
          </>
        }
      />
      <SalesNav active="orders" />
      <div className="mb-4">
        <SearchBox placeholder={t('sal.searchOrders')} />
      </div>
      <OrdersList rows={rows} isSearching={!!q?.trim()} />
      <div className="mt-4">
        <Pagination
          locale={locale}
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={total}
          basePath="/sales/orders"
          searchParams={{ q }}
          prevLabel={t('common.previous')}
          nextLabel={t('common.next')}
        />
      </div>
    </div>
  );
}
