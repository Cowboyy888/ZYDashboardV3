import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getPurchaseOrders, getSuppliers, getPurchaseOrderManualItems } from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
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
  const [pos, suppliers, manualItems] = await Promise.all([
    getPurchaseOrders(),
    getSuppliers(true),
    getPurchaseOrderManualItems(),
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
      <OrdersList rows={rows} productsByPo={productsByPo} />
    </div>
  );
}
