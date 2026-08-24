import { requirePermission } from '@/lib/auth';
import { hasPermission, canOverrideNegativeStock } from '@/lib/domain/rbac';
import {
  getSkus,
  getFamilies,
  getLocations,
  getBalances,
  getRecentMovements,
  getSalesOrders,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomers,
} from '@/lib/db/queries';
import { buildInventoryRows, buildInventoryReportRows } from '@/lib/domain/inventory-view';
import {
  buildSalesOrderRows,
  buildCommittedStockRows,
  buildOutstandingCustomersBySku,
} from '@/lib/domain/sales-view';
import { buildSkuLabel } from '@/lib/domain/products';
import { businessDate } from '@/lib/domain/datetime';
import type { MovementType } from '@/lib/domain/stock-ledger';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { InventoryClient } from './inventory-client';

export const dynamic = 'force-dynamic';

const SINGLE_ENTRY_TYPES: MovementType[] = [
  'opening_balance',
  'production_output',
  'other_stock_out',
  'adjustment',
];

const PERM: Record<MovementType, Parameters<typeof hasPermission>[1]> = {
  opening_balance: 'stock:opening',
  purchase_receipt: 'stock:production',
  production_output: 'stock:production',
  sale_delivery: 'stock:out',
  other_stock_out: 'stock:out',
  adjustment: 'stock:adjust',
  transfer_out: 'stock:transfer',
  transfer_in: 'stock:transfer',
};

export default async function InventoryPage() {
  const user = await requirePermission('inventory:view');
  const locale = await getLocale();
  const t = translator(locale);
  const [skus, families, locations, balances, movements, sos, items, delivered, customers] =
    await Promise.all([
      getSkus(),
      getFamilies(),
      getLocations(),
      getBalances(),
      getRecentMovements(60),
      getSalesOrders(),
      getSalesOrderItems(),
      getSalesOrderItemsDelivered(),
      getCustomers(true),
    ]);

  const rows = buildInventoryRows(skus, families, locations, balances, locale);
  const allowedTypes = SINGLE_ENTRY_TYPES.filter((ty) => hasPermission(user.role, PERM[ty]));
  const canTransfer = hasPermission(user.role, 'stock:transfer');

  // Reserved / Available / Customer-Project for the Inventory Report — reuses
  // Sales' own committed-stock numbers so the two pages never disagree.
  const soRows = buildSalesOrderRows(
    sos,
    items,
    delivered,
    customers,
    skus,
    families,
    businessDate(),
    locale,
  );
  const familyNameById = new Map(families.map((f) => [f.id, f.name]));
  const skuLabelById = new Map(
    skus.map((s) => [
      s.id,
      buildSkuLabel(
        {
          familyName: familyNameById.get(s.family_id) ?? '—',
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
  const committedRows = buildCommittedStockRows(soRows, physicalBySku, skuLabelById, skuUnitById);
  const committedBySku = new Map(committedRows.map((c) => [c.skuId, c]));
  const customersBySku = buildOutstandingCustomersBySku(soRows);
  const reportRows = buildInventoryReportRows(rows, committedBySku, customersBySku);

  return (
    <div>
      <PageHeader title={t('inv.title')} description={t('inv.desc')} />
      <InventoryClient
        rows={rows}
        reportRows={reportRows}
        skus={skus}
        families={families.map((f) => ({ id: f.id, name: f.name, name_english: f.name_english }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name, code: l.code }))}
        movements={movements}
        allowedTypes={allowedTypes}
        canTransfer={canTransfer}
        canOverride={canOverrideNegativeStock(user.role)}
        canSend={hasPermission(user.role, 'telegram:send')}
        canManageProducts={hasPermission(user.role, 'products:manage')}
        today={businessDate()}
      />
    </div>
  );
}
