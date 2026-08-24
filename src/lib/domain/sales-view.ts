/**
 * Pure assembly of sales display rows from master data + the ledger. Reused
 * by the Sales dashboard. No I/O.
 */
import { buildSkuLabel, type ConditionCode } from './products';
import { round3 } from './stock-ledger';
import {
  computeOutstanding,
  computeCommittedStock,
  isOverdue,
  isDueWithinDays,
  type SoStatus,
} from './sales';
import type { BusinessDate } from './datetime';

export interface SoLike {
  id: string;
  so_number: string | null;
  customer_id: string;
  order_date: string;
  expected_delivery_date: string | null;
  currency: string;
  status: SoStatus;
}

export interface SoItemLike {
  id: string;
  sales_order_id: string;
  sku_id: string;
  location_id: string;
  unit: string;
  ordered_qty: number;
  unit_price: number;
  line_total: number;
  area_per_sheet: number | null;
  price_per_sqm: number | null;
}

export interface DeliveredLike {
  item_id: string;
  delivered_qty: number;
}

export interface CustomerLike {
  id: string;
  name: string;
}

export interface SkuLike {
  id: string;
  family_id: string;
  diameter: string | null;
  size: string | null;
  hole: string | null;
  rod_count: string | null;
  extra: string | null;
  condition: ConditionCode;
  unit: string;
}

export interface FamilyLike {
  id: string;
  name: string;
}

export interface SoItemRow {
  itemId: string;
  skuId: string;
  skuLabel: string;
  locationId: string;
  unit: string;
  orderedQty: number;
  deliveredQty: number;
  outstandingQty: number;
  unitPrice: number;
  lineTotal: number;
  areaPerSheet: number | null;
  pricePerSqm: number | null;
}

export interface SalesOrderRow {
  soId: string;
  soNumber: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  currency: string;
  status: SoStatus;
  items: SoItemRow[];
  orderedTotal: number;
  deliveredTotal: number;
  outstandingTotal: number;
  grandTotal: number;
  isOverdue: boolean;
  isDueThisWeek: boolean;
}

/** Assemble full sales-order rows (with prices) — restrict to price-privileged roles before rendering. */
export function buildSalesOrderRows(
  sos: SoLike[],
  items: SoItemLike[],
  delivered: DeliveredLike[],
  customers: CustomerLike[],
  skus: SkuLike[],
  families: FamilyLike[],
  today: BusinessDate,
  locale: 'en' | 'zh' = 'zh',
): SalesOrderRow[] {
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const deliveredByItem = new Map(delivered.map((d) => [d.item_id, d.delivered_qty]));
  const itemsBySo = new Map<string, SoItemLike[]>();
  for (const it of items) {
    if (!itemsBySo.has(it.sales_order_id)) itemsBySo.set(it.sales_order_id, []);
    itemsBySo.get(it.sales_order_id)!.push(it);
  }

  return sos.map((so) => {
    const soItems = itemsBySo.get(so.id) ?? [];
    const itemRows: SoItemRow[] = soItems.map((it) => {
      const deliveredQty = round3(deliveredByItem.get(it.id) ?? 0);
      const sku = skuById.get(it.sku_id);
      const fam = sku ? (familyName.get(sku.family_id) ?? '—') : '—';
      const skuLabel = sku
        ? buildSkuLabel(
            {
              familyName: fam,
              diameter: sku.diameter,
              size: sku.size,
              hole: sku.hole,
              rodCount: sku.rod_count,
              extra: sku.extra,
              condition: sku.condition,
              unit: sku.unit,
            },
            locale,
          )
        : it.sku_id;
      return {
        itemId: it.id,
        skuId: it.sku_id,
        skuLabel,
        locationId: it.location_id,
        unit: it.unit,
        orderedQty: it.ordered_qty,
        deliveredQty,
        outstandingQty: computeOutstanding(it.ordered_qty, deliveredQty),
        unitPrice: it.unit_price,
        lineTotal: it.line_total,
        areaPerSheet: it.area_per_sheet,
        pricePerSqm: it.price_per_sqm,
      };
    });

    const orderedTotal = round3(itemRows.reduce((s, r) => s + r.orderedQty, 0));
    const deliveredTotal = round3(itemRows.reduce((s, r) => s + r.deliveredQty, 0));
    const outstandingTotal = round3(itemRows.reduce((s, r) => s + r.outstandingQty, 0));
    const grandTotal = itemRows.reduce((s, r) => s + r.lineTotal, 0);

    return {
      soId: so.id,
      soNumber: so.so_number ?? '—',
      customerId: so.customer_id,
      customerName: customerName.get(so.customer_id) ?? '—',
      orderDate: so.order_date,
      expectedDeliveryDate: so.expected_delivery_date,
      currency: so.currency,
      status: so.status,
      items: itemRows,
      orderedTotal,
      deliveredTotal,
      outstandingTotal,
      grandTotal,
      isOverdue:
        (so.status === 'confirmed' || so.status === 'partially_delivered') &&
        isOverdue(so.expected_delivery_date, today),
      isDueThisWeek:
        (so.status === 'confirmed' || so.status === 'partially_delivered') &&
        isDueWithinDays(so.expected_delivery_date, today, 7),
    };
  });
}

export interface CommittedStockRow {
  skuId: string;
  skuLabel: string;
  unit: string;
  physicalStock: number;
  outstandingOrdered: number;
  committedStock: number;
}

/** Physical stock − outstanding ordered (not yet delivered) quantity, per SKU. */
export function buildCommittedStockRows(
  soRows: SalesOrderRow[],
  physicalBySku: Map<string, number>,
  skuLabelById: Map<string, string>,
  skuUnitById: Map<string, string>,
): CommittedStockRow[] {
  const outstandingBySku = new Map<string, number>();
  for (const so of soRows) {
    if (so.status !== 'confirmed' && so.status !== 'partially_delivered') continue;
    for (const item of so.items) {
      if (item.outstandingQty <= 0) continue;
      outstandingBySku.set(
        item.skuId,
        round3((outstandingBySku.get(item.skuId) ?? 0) + item.outstandingQty),
      );
    }
  }

  const skuIds = new Set([...physicalBySku.keys(), ...outstandingBySku.keys()]);
  return [...skuIds].map((skuId) => {
    const physicalStock = round3(physicalBySku.get(skuId) ?? 0);
    const outstandingOrdered = round3(outstandingBySku.get(skuId) ?? 0);
    return {
      skuId,
      skuLabel: skuLabelById.get(skuId) ?? skuId,
      unit: skuUnitById.get(skuId) ?? '',
      physicalStock,
      outstandingOrdered,
      committedStock: computeCommittedStock(physicalStock, outstandingOrdered),
    };
  });
}

/**
 * Customer/project name(s) with outstanding (not yet delivered) qty on each
 * SKU — same status/outstandingQty filter as `buildCommittedStockRows`, so
 * "who is this reserved stock earmarked for" always matches "how much is
 * reserved". Used by the Inventory Report's Customer/Project column.
 */
export function buildOutstandingCustomersBySku(soRows: SalesOrderRow[]): Map<string, string[]> {
  const bySku = new Map<string, string[]>();
  for (const so of soRows) {
    if (so.status !== 'confirmed' && so.status !== 'partially_delivered') continue;
    for (const item of so.items) {
      if (item.outstandingQty <= 0) continue;
      const names = bySku.get(item.skuId) ?? [];
      if (!names.includes(so.customerName)) names.push(so.customerName);
      bySku.set(item.skuId, names);
    }
  }
  return bySku;
}
