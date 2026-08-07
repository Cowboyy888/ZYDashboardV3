/**
 * Pure assembly of purchase-order display rows from master data. No I/O.
 * Purchase orders are header-only — no items, no receiving.
 */
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

export interface SupplierLike {
  id: string;
  name: string;
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
}

/** Assemble PO header rows for display — restrict to cost-privileged roles before rendering. */
export function buildPurchaseOrderRows(
  pos: PoLike[],
  suppliers: SupplierLike[],
): PurchaseOrderRow[] {
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));

  return pos.map((po) => ({
    poId: po.id,
    poNumber: po.po_number ?? '—',
    supplierId: po.supplier_id,
    supplierName: supplierName.get(po.supplier_id) ?? '—',
    orderDate: po.order_date,
    currency: po.currency,
    status: po.status,
    notes: po.notes,
    attachmentPath: po.attachment_path,
  }));
}
