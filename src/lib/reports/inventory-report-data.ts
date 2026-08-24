import 'server-only';
import {
  getSkus,
  getFamilies,
  getLocations,
  getBalances,
  getSalesOrders,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomers,
} from '@/lib/db/queries';
import {
  buildInventoryRows,
  buildInventoryReportRows,
  type InventoryReportRow,
} from '@/lib/domain/inventory-view';
import {
  buildSalesOrderRows,
  buildCommittedStockRows,
  buildOutstandingCustomersBySku,
} from '@/lib/domain/sales-view';
import { buildSkuLabel } from '@/lib/domain/products';
import { businessDate } from '@/lib/domain/datetime';

/**
 * Assembles the Inventory Report's rows (Standard + Special, with Reserved /
 * Available / Customer-Project) — shared by the Inventory page and both the
 * PDF and Excel exports, so all three can never drift apart. Reserved /
 * Available reuse Sales' own committed-stock numbers rather than
 * recomputing them.
 */
export async function getInventoryReportRows(locale: 'en' | 'zh'): Promise<InventoryReportRow[]> {
  const [skus, families, locations, balances, sos, items, delivered, customers] = await Promise.all(
    [
      getSkus(),
      getFamilies(),
      getLocations(),
      getBalances(),
      getSalesOrders(),
      getSalesOrderItems(),
      getSalesOrderItemsDelivered(),
      getCustomers(true),
    ],
  );

  const rows = buildInventoryRows(skus, families, locations, balances, locale);
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
  return buildInventoryReportRows(rows, committedBySku, customersBySku);
}
