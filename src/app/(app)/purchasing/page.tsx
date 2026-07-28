import { requirePermission } from '@/lib/auth';
import {
  getPurchaseOrders,
  getPurchaseOrderItems,
  getPurchaseOrderItemsReceived,
  getSuppliers,
  getSkus,
  getFamilies,
  getBalances,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows, buildProjectedStockRows } from '@/lib/domain/purchasing-view';
import { buildSkuLabel } from '@/lib/domain/products';
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

  const [pos, items, received, suppliers, skus, families, balances] = await Promise.all([
    getPurchaseOrders(),
    getPurchaseOrderItems(),
    getPurchaseOrderItemsReceived(),
    getSuppliers(true),
    getSkus(true),
    getFamilies(true),
    getBalances(),
  ]);

  const rows = buildPurchaseOrderRows(
    pos,
    items,
    received,
    suppliers,
    skus,
    families,
    today,
    locale,
  );

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

  const projectedRows = buildProjectedStockRows(
    rows,
    physicalBySku,
    skuLabelById,
    skuUnitById,
  ).filter((r) => r.outstandingOrdered > 0);

  return (
    <div>
      <PageHeader title={t('pur.dashboard')} description={t('pur.dashDesc')} />
      <PurchasingNav active="dashboard" />
      <PurchasingDashboard rows={rows} projectedRows={projectedRows} />
    </div>
  );
}
