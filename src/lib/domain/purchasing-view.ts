/**
 * Pure assembly of purchasing display rows from master data + the ledger.
 * Reused by the Purchasing dashboard and the Telegram "Incoming Purchases"
 * section so both show identical numbers. No I/O.
 */
import { buildSkuLabel, type ConditionCode } from './products';
import { round3 } from './stock-ledger';
import {
  computeOutstanding,
  computeProjectedStock,
  isDueOrOverdue,
  isOverdue,
  isDueWithinDays,
  type PoStatus,
} from './purchasing';
import type { BusinessDate } from './datetime';

export interface PoLike {
  id: string;
  po_number: string | null;
  supplier_id: string;
  order_date: string;
  expected_arrival_date: string | null;
  currency: string;
  status: PoStatus;
}

export interface PoItemLike {
  id: string;
  purchase_order_id: string;
  sku_id: string;
  location_id: string;
  unit: string;
  ordered_qty: number;
  unit_cost: number;
  line_total: number;
}

export interface ReceivedLike {
  item_id: string;
  received_qty: number;
}

export interface SupplierLike {
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

export interface PoItemRow {
  itemId: string;
  skuId: string;
  skuLabel: string;
  locationId: string;
  unit: string;
  orderedQty: number;
  receivedQty: number;
  outstandingQty: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrderRow {
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  expectedArrivalDate: string | null;
  currency: string;
  status: PoStatus;
  items: PoItemRow[];
  orderedTotal: number;
  receivedTotal: number;
  outstandingTotal: number;
  isOverdue: boolean;
  isDueThisWeek: boolean;
}

/** Assemble full purchase-order rows (with costs) — restrict to cost-privileged roles before rendering. */
export function buildPurchaseOrderRows(
  pos: PoLike[],
  items: PoItemLike[],
  received: ReceivedLike[],
  suppliers: SupplierLike[],
  skus: SkuLike[],
  families: FamilyLike[],
  today: BusinessDate,
  locale: 'en' | 'zh' = 'zh',
): PurchaseOrderRow[] {
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const receivedByItem = new Map(received.map((r) => [r.item_id, r.received_qty]));
  const itemsByPo = new Map<string, PoItemLike[]>();
  for (const it of items) {
    if (!itemsByPo.has(it.purchase_order_id)) itemsByPo.set(it.purchase_order_id, []);
    itemsByPo.get(it.purchase_order_id)!.push(it);
  }

  return pos.map((po) => {
    const poItems = itemsByPo.get(po.id) ?? [];
    const itemRows: PoItemRow[] = poItems.map((it) => {
      const receivedQty = round3(receivedByItem.get(it.id) ?? 0);
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
        receivedQty,
        outstandingQty: computeOutstanding(it.ordered_qty, receivedQty),
        unitCost: it.unit_cost,
        lineTotal: it.line_total,
      };
    });

    const orderedTotal = round3(itemRows.reduce((s, r) => s + r.orderedQty, 0));
    const receivedTotal = round3(itemRows.reduce((s, r) => s + r.receivedQty, 0));
    const outstandingTotal = round3(itemRows.reduce((s, r) => s + r.outstandingQty, 0));

    return {
      poId: po.id,
      poNumber: po.po_number ?? '—',
      supplierId: po.supplier_id,
      supplierName: supplierName.get(po.supplier_id) ?? '—',
      orderDate: po.order_date,
      expectedArrivalDate: po.expected_arrival_date,
      currency: po.currency,
      status: po.status,
      items: itemRows,
      orderedTotal,
      receivedTotal,
      outstandingTotal,
      isOverdue:
        (po.status === 'ordered' || po.status === 'partially_received') &&
        isOverdue(po.expected_arrival_date, today),
      isDueThisWeek:
        (po.status === 'ordered' || po.status === 'partially_received') &&
        isDueWithinDays(po.expected_arrival_date, today, 7),
    };
  });
}

export interface ProjectedStockRow {
  skuId: string;
  skuLabel: string;
  unit: string;
  physicalStock: number;
  outstandingOrdered: number;
  projectedStock: number;
}

/** Physical stock + outstanding ordered quantity, per SKU. Kept separate from physical stock everywhere. */
export function buildProjectedStockRows(
  poRows: PurchaseOrderRow[],
  physicalBySku: Map<string, number>,
  skuLabelById: Map<string, string>,
  skuUnitById: Map<string, string>,
): ProjectedStockRow[] {
  const outstandingBySku = new Map<string, number>();
  for (const po of poRows) {
    if (po.status !== 'ordered' && po.status !== 'partially_received') continue;
    for (const item of po.items) {
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
      projectedStock: computeProjectedStock(physicalStock, outstandingOrdered),
    };
  });
}

export interface IncomingPurchaseRow {
  poNumber: string;
  supplierName: string;
  expectedArrivalDate: string | null;
  skuLabel: string;
  outstandingQty: number;
  unit: string;
}

/**
 * "Incoming Purchases" for the Telegram inventory report — one row per PO
 * item still outstanding on a PO due within `windowDays` or already overdue.
 * NEVER includes cost fields (unit_cost/line_total) by construction — this
 * type has no such field to leak.
 */
export function buildIncomingPurchaseRows(
  poRows: PurchaseOrderRow[],
  today: BusinessDate,
  windowDays = 7,
): IncomingPurchaseRow[] {
  const rows: IncomingPurchaseRow[] = [];
  for (const po of poRows) {
    if (po.status !== 'ordered' && po.status !== 'partially_received') continue;
    if (!isDueOrOverdue(po.expectedArrivalDate, today, windowDays)) continue;
    for (const item of po.items) {
      if (item.outstandingQty <= 0) continue;
      rows.push({
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        expectedArrivalDate: po.expectedArrivalDate,
        skuLabel: item.skuLabel,
        outstandingQty: item.outstandingQty,
        unit: item.unit,
      });
    }
  }
  return rows;
}
