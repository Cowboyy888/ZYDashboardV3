/**
 * Pure assembly of purchase-order display rows from master data + line
 * items. No I/O. Mirrors sales-view.ts's buildSalesOrderRows shape.
 */
import { buildSkuLabel, type ConditionCode } from './products';
import { round3 } from './stock-ledger';
import type { PoStatus } from './purchasing';

export interface PoLike {
  id: string;
  po_number: string | null;
  supplier_id: string;
  order_date: string;
  currency: string;
  status: PoStatus;
  notes: string | null;
  attachment_path: string | null;
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
  familyId: string;
  locationId: string;
  unit: string;
  orderedQty: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrderRow {
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  orderDate: string;
  currency: string;
  status: PoStatus;
  notes: string | null;
  attachmentPath: string | null;
  items: PoItemRow[];
  itemCount: number;
  orderedTotal: number;
  grandTotal: number;
}

/** Assemble full PO rows (with costs) — restrict to cost-privileged roles before rendering. */
export function buildPurchaseOrderRows(
  pos: PoLike[],
  items: PoItemLike[],
  suppliers: SupplierLike[],
  skus: SkuLike[],
  families: FamilyLike[],
  locale: 'en' | 'zh' = 'zh',
): PurchaseOrderRow[] {
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const itemsByPo = new Map<string, PoItemLike[]>();
  for (const it of items) {
    if (!itemsByPo.has(it.purchase_order_id)) itemsByPo.set(it.purchase_order_id, []);
    itemsByPo.get(it.purchase_order_id)!.push(it);
  }

  return pos.map((po) => {
    const poItems = itemsByPo.get(po.id) ?? [];
    const itemRows: PoItemRow[] = poItems.map((it) => {
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
        familyId: sku?.family_id ?? '',
        locationId: it.location_id,
        unit: it.unit,
        orderedQty: it.ordered_qty,
        unitCost: it.unit_cost,
        lineTotal: it.line_total,
      };
    });

    return {
      poId: po.id,
      poNumber: po.po_number ?? '—',
      supplierId: po.supplier_id,
      supplierName: supplierName.get(po.supplier_id) ?? '—',
      orderDate: po.order_date,
      currency: po.currency,
      status: po.status,
      notes: po.notes,
      attachmentPath: po.attachment_path,
      items: itemRows,
      itemCount: itemRows.length,
      orderedTotal: round3(itemRows.reduce((s, r) => s + r.orderedQty, 0)),
      grandTotal: itemRows.reduce((s, r) => s + r.lineTotal, 0),
    };
  });
}
