import { describe, it, expect } from 'vitest';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';

const families = [{ id: 'fam-mesh', name: '钢筋网' }];
const suppliers = [{ id: 'sup-1', name: 'ABC Steel Co.' }];
const skus = [
  {
    id: 'sku-1',
    family_id: 'fam-mesh',
    diameter: '9厘',
    size: '3×6',
    hole: '20孔',
    rod_count: null,
    extra: null,
    condition: 'normal' as const,
    unit: '张',
  },
];

const po = {
  id: 'po-1',
  po_number: 'PO-2026-0001',
  supplier_id: 'sup-1',
  order_date: '2026-08-01',
  currency: 'USD',
  status: 'draft' as const,
  notes: null,
  attachment_path: null,
};

describe('buildPurchaseOrderRows', () => {
  it('computes itemCount/orderedTotal/grandTotal for a multi-item PO', () => {
    const items = [
      {
        id: 'item-1',
        purchase_order_id: 'po-1',
        sku_id: 'sku-1',
        location_id: 'loc-1',
        unit: '张',
        ordered_qty: 100,
        unit_cost: 2.5,
        line_total: 250,
      },
      {
        id: 'item-2',
        purchase_order_id: 'po-1',
        sku_id: 'sku-1',
        location_id: 'loc-1',
        unit: '张',
        ordered_qty: 50,
        unit_cost: 3,
        line_total: 150,
      },
    ];
    const rows = buildPurchaseOrderRows([po], items, suppliers, skus, families, 'en');
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.itemCount).toBe(2);
    expect(r.orderedTotal).toBe(150);
    expect(r.grandTotal).toBe(400);
    expect(r.items[0]!.skuLabel).toContain('钢筋网');
  });

  it('produces an empty items array for a PO with zero line items, without throwing', () => {
    const rows = buildPurchaseOrderRows([po], [], suppliers, skus, families, 'en');
    const r = rows[0]!;
    expect(r.items).toEqual([]);
    expect(r.itemCount).toBe(0);
    expect(r.grandTotal).toBe(0);
    expect(r.orderedTotal).toBe(0);
  });

  it('falls back to the raw sku_id when the sku is not in the passed-in skus array', () => {
    const items = [
      {
        id: 'item-1',
        purchase_order_id: 'po-1',
        sku_id: 'sku-missing',
        location_id: 'loc-1',
        unit: '张',
        ordered_qty: 10,
        unit_cost: 1,
        line_total: 10,
      },
    ];
    const rows = buildPurchaseOrderRows([po], items, suppliers, skus, families, 'en');
    expect(rows[0]!.items[0]!.skuLabel).toBe('sku-missing');
  });
});
