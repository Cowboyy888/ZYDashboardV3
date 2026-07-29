import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getSalesOrders,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomers,
  getSkus,
  getFamilies,
} from '@/lib/db/queries';
import { buildSalesOrderRows } from '@/lib/domain/sales-view';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { SalesNav } from '../sales-nav';
import { OrdersList } from './orders-list';

export const dynamic = 'force-dynamic';

export default async function SalesOrdersPage() {
  const user = await requirePermission('sales:view');
  const locale = await getLocale();
  const t = translator(locale);
  const [sos, items, delivered, customers, skus, families] = await Promise.all([
    getSalesOrders(),
    getSalesOrderItems(),
    getSalesOrderItemsDelivered(),
    getCustomers(true),
    getSkus(true),
    getFamilies(true),
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
      <OrdersList rows={rows} />
    </div>
  );
}
