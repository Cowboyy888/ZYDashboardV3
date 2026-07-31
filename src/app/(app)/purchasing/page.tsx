import { requirePermission } from '@/lib/auth';
import { getPurchaseOrders, getSuppliers } from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { businessDate } from '@/lib/domain/datetime';
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
  const today = businessDate();

  const [pos, suppliers] = await Promise.all([getPurchaseOrders(), getSuppliers(true)]);
  const rows = buildPurchaseOrderRows(pos, suppliers, today);

  return (
    <div>
      <PageHeader title={t('pur.dashboard')} description={t('pur.dashDesc')} />
      <PurchasingNav active="dashboard" />
      <PurchasingDashboard rows={rows} />
    </div>
  );
}
