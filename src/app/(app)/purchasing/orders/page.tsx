import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPurchaseOrdersPage,
  getSuppliers,
  getPurchaseOrderManualItems,
  DEFAULT_PAGE_SIZE,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { SearchBox } from '@/components/ui/search-box';
import { Pagination } from '@/components/ui/pagination';
import { PurchasingNav } from '../purchasing-nav';
import { OrdersList } from './orders-list';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requirePermission('purchasing:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { rows: pos, total } = await getPurchaseOrdersPage({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    search: q,
  });
  const poIds = pos.map((po) => po.id);

  const [suppliers, manualItems] = await Promise.all([
    getSuppliers(true),
    getPurchaseOrderManualItems(poIds),
  ]);

  const rows = buildPurchaseOrderRows(pos, suppliers);
  const productsByPo: Record<string, string[]> = {};
  for (const item of manualItems) {
    (productsByPo[item.purchase_order_id] ??= []).push(item.product_name);
  }

  return (
    <div>
      <PageHeader
        title={t('pur.orders')}
        description={t('pur.dashDesc')}
        actions={
          <>
            <a href="/api/export/purchasing" className={buttonVariants({ variant: 'outline' })}>
              {t('common.exportExcel')}
            </a>
            {hasPermission(user.role, 'purchasing:manage') && (
              <Link href="/purchasing/orders/new" className={buttonVariants()}>
                {t('pur.newPo')}
              </Link>
            )}
          </>
        }
      />
      <PurchasingNav active="orders" />
      <div className="mb-4">
        <SearchBox placeholder={t('pur.searchOrders')} />
      </div>
      <OrdersList rows={rows} productsByPo={productsByPo} isSearching={!!q?.trim()} />
      <div className="mt-4">
        <Pagination
          locale={locale}
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={total}
          basePath="/purchasing/orders"
          searchParams={{ q }}
          prevLabel={t('common.previous')}
          nextLabel={t('common.next')}
        />
      </div>
    </div>
  );
}
