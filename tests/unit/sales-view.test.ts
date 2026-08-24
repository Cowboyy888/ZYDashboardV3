import { describe, it, expect } from 'vitest';
import { buildOutstandingCustomersBySku } from '@/lib/domain/sales-view';
import type { SalesOrderRow } from '@/lib/domain/sales-view';

function soRow(over: Partial<SalesOrderRow> & { items: SalesOrderRow['items'] }): SalesOrderRow {
  return {
    soId: 'so-1',
    soNumber: 'SO-0001',
    customerId: 'cust-1',
    customerName: 'ABC Construction',
    orderDate: '2026-01-01',
    expectedDeliveryDate: null,
    currency: 'USD',
    status: 'confirmed',
    orderedTotal: 0,
    deliveredTotal: 0,
    outstandingTotal: 0,
    grandTotal: 0,
    isOverdue: false,
    isDueThisWeek: false,
    ...over,
  };
}

const item = (over: Partial<SalesOrderRow['items'][number]> = {}) => ({
  itemId: 'item-1',
  skuId: 'sku-1',
  skuLabel: 'label',
  locationId: 'loc-1',
  unit: '张',
  orderedQty: 10,
  deliveredQty: 0,
  outstandingQty: 10,
  unitPrice: 0,
  lineTotal: 0,
  areaPerSheet: null,
  pricePerSqm: null,
  ...over,
});

describe('buildOutstandingCustomersBySku', () => {
  it('groups customer names with outstanding qty by SKU', () => {
    const rows = [
      soRow({ soId: 'so-1', customerName: 'ABC Construction', items: [item({ skuId: 'sku-1' })] }),
      soRow({ soId: 'so-2', customerName: 'XYZ Builders', items: [item({ skuId: 'sku-1' })] }),
    ];
    const bySku = buildOutstandingCustomersBySku(rows);
    expect(bySku.get('sku-1')).toEqual(['ABC Construction', 'XYZ Builders']);
  });

  it('skips lines with no outstanding qty (fully delivered)', () => {
    const rows = [
      soRow({
        items: [item({ skuId: 'sku-1', orderedQty: 10, deliveredQty: 10, outstandingQty: 0 })],
      }),
    ];
    expect(buildOutstandingCustomersBySku(rows).has('sku-1')).toBe(false);
  });

  it('skips draft/delivered/cancelled orders — only confirmed/partially_delivered reserve stock', () => {
    const rows = [
      soRow({ status: 'draft', items: [item({ skuId: 'sku-1' })] }),
      soRow({ status: 'delivered', items: [item({ skuId: 'sku-2' })] }),
      soRow({ status: 'cancelled', items: [item({ skuId: 'sku-3' })] }),
    ];
    const bySku = buildOutstandingCustomersBySku(rows);
    expect(bySku.size).toBe(0);
  });

  it('does not list the same customer twice for multiple orders of the same SKU', () => {
    const rows = [
      soRow({ soId: 'so-1', customerName: 'ABC Construction', items: [item({ skuId: 'sku-1' })] }),
      soRow({ soId: 'so-2', customerName: 'ABC Construction', items: [item({ skuId: 'sku-1' })] }),
    ];
    expect(buildOutstandingCustomersBySku(rows).get('sku-1')).toEqual(['ABC Construction']);
  });
});
