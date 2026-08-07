import { requirePermission } from '@/lib/auth';
import {
  getPurchaseOrders,
  getPurchaseOrderItems,
  getSuppliers,
  getSkus,
  getFamilies,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { PurchasingNav } from './purchasing-nav';
import { PurchasingDashboard } from './purchasing-dashboard';

export const dynamic = 'force-dynamic';

export default async function PurchasingPage() {
  await requirePermission('purchasing:view');
  const locale = await getLocale();
  const t = translator(locale);

  const [pos, items, suppliers, skus, families] = await Promise.all([
    getPurchaseOrders(),
    getPurchaseOrderItems(),
    getSuppliers(true),
    getSkus(true),
    getFamilies(true),
  ]);
  const rows = buildPurchaseOrderRows(pos, items, suppliers, skus, families, locale);

  return (
    <div>
      <PageHeader title={t('pur.dashboard')} description={t('pur.dashDesc')} />
      <PurchasingNav active="dashboard" />
      <PurchasingDashboard rows={rows} />
    </div>
  );
}
