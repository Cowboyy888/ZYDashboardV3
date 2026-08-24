import { describe, it, expect } from 'vitest';
import {
  buildInventoryRows,
  totalsByFamilyUnit,
  buildInventoryReportRows,
  totalsBySpecTypeUnit,
} from '@/lib/domain/inventory-view';
import type { InventoryDisplayRow, InventoryReportRow } from '@/lib/domain/inventory-view';

const families = [{ id: 'fam-mesh', name: '钢筋网' }];
const locations = [
  { id: 'loc-s', code: 'storage_room', name: 'Storage Room' },
  { id: 'loc-w', code: 'warehouse', name: 'Warehouse' },
];
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
    minimum_level: 100,
  },
];

describe('inventory view assembly', () => {
  it('splits balances into Storage Room / Warehouse / total and flags low stock', () => {
    const balances = [
      { sku_id: 'sku-1', location_id: 'loc-s', quantity: 60 },
      { sku_id: 'sku-1', location_id: 'loc-w', quantity: 30 },
    ];
    const rows = buildInventoryRows(skus, families, locations, balances, 'en');
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.storageRoom).toBe(60);
    expect(r.warehouse).toBe(30);
    expect(r.total).toBe(90);
    expect(r.isLow).toBe(true); // 90 <= min 100
    expect(r.label).toContain('钢筋网');
    expect(r.label).toContain('Normal');
    expect(r.specType).toBe('standard'); // size "3×6"
  });

  it('reports zero for a SKU with no movements and is not low when no minimum set', () => {
    const rows = buildInventoryRows(
      [{ ...skus[0]!, minimum_level: 0 }],
      families,
      locations,
      [],
      'en',
    );
    expect(rows[0]!.total).toBe(0);
    expect(rows[0]!.isLow).toBe(false);
  });

  it('sorts by family, then by diameter descending (high to low) — matches the Telegram report', () => {
    const mixedFamilies = [
      { id: 'fam-mesh', name: '钢筋网' },
      { id: 'fam-coil', name: '螺纹盘圆' },
    ];
    const mixedSkus = [
      { ...skus[0]!, id: 'sku-7.4', diameter: '7.4' },
      { ...skus[0]!, id: 'sku-9', diameter: '9' },
      { ...skus[0]!, id: 'sku-7.8', diameter: '7.8' },
      {
        ...skus[0]!,
        id: 'sku-coil-10',
        family_id: 'fam-coil',
        diameter: '10厘',
        size: null,
        hole: null,
      },
    ];
    const rows = buildInventoryRows(mixedSkus, mixedFamilies, locations, [], 'en');
    // Same family stays grouped, each group sorted diameter high -> low.
    expect(rows.map((r) => r.skuId)).toEqual(['sku-9', 'sku-7.8', 'sku-7.4', 'sku-coil-10']);
  });
});

describe('totalsByFamilyUnit — never sum across units', () => {
  const row = (
    familyId: string,
    familyName: string,
    unit: string,
    total: number,
  ): InventoryDisplayRow => ({
    skuId: `${familyId}-${unit}-${total}`,
    familyId,
    familyName,
    label: `${familyName} ${unit}`,
    diameter: null,
    size: null,
    hole: null,
    notes: null,
    specType: 'special',
    condition: 'normal',
    unit,
    minimumLevel: 0,
    storageRoom: total,
    warehouse: 0,
    other: 0,
    total,
    isLow: false,
  });

  it('keeps 张 / 捆 / 吨 as separate lines, never adding them together', () => {
    const rows = [
      row('mesh', '钢筋网', '张', 329),
      row('mesh', '钢筋网', '张', 64), // same family+unit -> summed to 393
      row('wire', '拔丝料', '捆', 30.5),
      row('wire', '拔丝料', '捆', 10), // -> 40.5
      row('coil', '螺纹盘圆', '吨', 12),
    ];
    const totals = totalsByFamilyUnit(rows);

    const mesh = totals.find((t) => t.familyName === '钢筋网' && t.unit === '张')!;
    const wire = totals.find((t) => t.familyName === '拔丝料' && t.unit === '捆')!;
    const coil = totals.find((t) => t.familyName === '螺纹盘圆' && t.unit === '吨')!;
    expect(mesh.total).toBe(393);
    expect(wire.total).toBe(40.5);
    expect(coil.total).toBe(12);
    // No single mixed-unit grand total exists — one line per (family, unit).
    expect(totals).toHaveLength(3);
  });

  it('splits one family that has two units into two separate lines', () => {
    const rows = [row('mesh', '钢筋网', '张', 100), row('mesh', '钢筋网', '吨', 5)];
    const totals = totalsByFamilyUnit(rows);
    expect(totals).toHaveLength(2);
    expect(totals.map((t) => t.unit).sort()).toEqual(['吨', '张']);
    // The 张 count and the 吨 count are never combined.
    expect(totals.find((t) => t.unit === '张')!.total).toBe(100);
    expect(totals.find((t) => t.unit === '吨')!.total).toBe(5);
  });
});

describe('Inventory Report — Reserved / Available + Standard/Special totals', () => {
  const displayRow = (over: Partial<InventoryDisplayRow> = {}): InventoryDisplayRow => ({
    skuId: 'sku-1',
    familyId: 'fam-mesh',
    familyName: '钢筋网',
    label: '钢筋网 · 3×6 (张)',
    diameter: '9厘',
    size: '3×6',
    hole: '20孔',
    notes: null,
    specType: 'standard',
    condition: 'normal',
    unit: '张',
    minimumLevel: 100,
    storageRoom: 60,
    warehouse: 30,
    other: 0,
    total: 90,
    isLow: true,
    ...over,
  });

  it('layers Reserved/Available from the committed-stock map onto each row', () => {
    const rows = [displayRow()];
    const committedBySku = new Map([['sku-1', { outstandingOrdered: 20, committedStock: 70 }]]);
    const customersBySku = new Map([['sku-1', ['ABC Construction', 'XYZ Builders']]]);
    const report = buildInventoryReportRows(rows, committedBySku, customersBySku);
    expect(report[0]!.reserved).toBe(20);
    expect(report[0]!.available).toBe(70);
    expect(report[0]!.customerProject).toBe('ABC Construction, XYZ Builders');
  });

  it('defaults Reserved to 0 and Available to physical total when a SKU has no outstanding orders', () => {
    const rows = [displayRow({ skuId: 'sku-2' })];
    const report = buildInventoryReportRows(rows, new Map(), new Map());
    expect(report[0]!.reserved).toBe(0);
    expect(report[0]!.available).toBe(90);
    expect(report[0]!.customerProject).toBe('—');
  });

  it('totals Stock/Reserved/Available by (specType, unit) — never mixing Standard and Special or different units', () => {
    const reportRows: InventoryReportRow[] = [
      {
        ...displayRow({ skuId: 'a' }),
        specType: 'standard',
        unit: '张',
        total: 100,
        reserved: 10,
        available: 90,
        customerProject: '—',
      },
      {
        ...displayRow({ skuId: 'b' }),
        specType: 'standard',
        unit: '张',
        total: 50,
        reserved: 5,
        available: 45,
        customerProject: '—',
      },
      {
        ...displayRow({ skuId: 'c', size: null, familyName: '螺纹盘圆' }),
        specType: 'special',
        unit: '吨',
        total: 12,
        reserved: 2,
        available: 10,
        customerProject: '—',
      },
    ];
    const totals = totalsBySpecTypeUnit(reportRows);
    expect(totals).toHaveLength(2); // standard/张 and special/吨 — never combined
    const standard = totals.find((u) => u.specType === 'standard' && u.unit === '张')!;
    const special = totals.find((u) => u.specType === 'special' && u.unit === '吨')!;
    expect(standard.stockTotal).toBe(150);
    expect(standard.reservedTotal).toBe(15);
    expect(standard.availableTotal).toBe(135);
    expect(special.stockTotal).toBe(12);
    expect(special.reservedTotal).toBe(2);
    expect(special.availableTotal).toBe(10);
  });
});
