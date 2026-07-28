import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPurchaseOrders,
  getPurchaseOrderItems,
  getPurchaseOrderItemsReceived,
  getSuppliers,
  getSkus,
  getFamilies,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { PurchasingNav } from '../purchasing-nav';
import { OrdersList } from './orders-list';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrdersPage() {
  const user = await requirePermission('purchasing:view');
  const locale = await getLocale();
  const t = translator(locale);
  const [pos, items, received, suppliers, skus, families] = await Promise.all([
    getPurchaseOrders(),
    getPurchaseOrderItems(),
    getPurchaseOrderItemsReceived(),
    getSuppliers(true),
    getSkus(true),
    getFamilies(true),
  ]);

  const rows = buildPurchaseOrderRows(
    pos,
    items,
    received,
    suppliers,
    skus,
    families,
    businessDate(),
    locale,
  );

  return (
    <div>
      <PageHeader
        title={t('pur.orders')}
        description={t('pur.dashDesc')}
        actions={
          hasPermission(user.role, 'purchasing:manage') ? (
            <Link href="/purchasing/orders/new" className={buttonVariants()}>
              {t('pur.newPo')}
            </Link>
          ) : undefined
        }
      />
      <PurchasingNav active="orders" />
      <OrdersList rows={rows} />
    </div>
  );
}
