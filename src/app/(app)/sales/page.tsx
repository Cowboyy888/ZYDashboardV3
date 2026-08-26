import { requirePermission } from '@/lib/auth';
import {
  getSalesOrders,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomers,
  getSkus,
  getFamilies,
  getBalances,
} from '@/lib/db/queries';
import { buildSalesOrderRows, buildCommittedStockRows } from '@/lib/domain/sales-view';
import { buildSkuLabel } from '@/lib/domain/products';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from './sales-nav';
import { SalesDashboard } from './sales-dashboard';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const user = await requirePermission('sales:view');
  const locale = await getLocale();
  const t = translator(locale);
  const today = businessDate();

  const [sos, items, delivered, customers, skus, families, balances] = await Promise.all([
    getSalesOrders(),
    getSalesOrderItems(),
    getSalesOrderItemsDelivered(),
    getCustomers(true),
    getSkus(true),
    getFamilies(true),
    getBalances(),
  ]);

  const rows = buildSalesOrderRows(sos, items, delivered, customers, skus, families, today, locale);

  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const skuLabelById = new Map(
    skus.map((s) => [
      s.id,
      buildSkuLabel(
        {
          familyName: familyName.get(s.family_id) ?? '—',
          diameter: s.diameter,
          size: s.size,
          hole: s.hole,
          rodCount: s.rod_count,
          extra: s.extra,
          condition: s.condition,
          unit: s.unit,
        },
        locale,
      ),
    ]),
  );
  const skuUnitById = new Map(skus.map((s) => [s.id, s.unit]));

  const physicalBySku = new Map<string, number>();
  for (const b of balances) {
    physicalBySku.set(b.sku_id, (physicalBySku.get(b.sku_id) ?? 0) + Number(b.quantity));
  }

  const committedRows = buildCommittedStockRows(
    rows,
    physicalBySku,
    skuLabelById,
    skuUnitById,
  ).filter((r) => r.outstandingOrdered > 0);

  return (
    <div>
      <PageHeader title={t('sal.dashboard')} description={t('sal.dashDesc')} />
      <SalesNav active="dashboard" role={user.role} />
      <SalesDashboard rows={rows} committedRows={committedRows} />
    </div>
  );
}
