import { describe, it, expect } from 'vitest';
import { renderInventoryReport, type InventoryReportRow } from '@/lib/domain/reports';

describe('inventory report rendering', () => {
  it('renders a plain-language stock list (网片 then 盘圆 then 拔丝料), then a low-stock section', () => {
    const rows: InventoryReportRow[] = [
      {
        skuLabel: '钢筋网 · 9厘 | 3×6 | 20孔 | Normal (张)',
        familyName: '钢筋网',
        condition: 'normal',
        unit: '张',
        storageRoom: 279,
        warehouse: 50,
        total: 329,
        minimumLevel: 100,
        isLow: false,
        diameter: '9厘',
        size: '3×6',
        hole: '20孔',
        rodCount: null,
        extra: null,
      },
      {
        skuLabel: '钢筋网 · 5.5厘 | 3×6 | 20孔 | 15根 | Normal (张)',
        familyName: '钢筋网',
        condition: 'normal',
        unit: '张',
        storageRoom: 1173,
        warehouse: 0,
        total: 1173,
        minimumLevel: 0,
        isLow: false,
        diameter: '5.5厘',
        size: '3×6',
        hole: '20孔',
        rodCount: '15根',
        extra: null,
      },
      {
        skuLabel: '螺纹盘圆 · 10厘 (捆)',
        familyName: '螺纹盘圆',
        condition: 'normal',
        unit: '捆',
        storageRoom: 10,
        warehouse: 0,
        total: 10,
        minimumLevel: 20,
        isLow: true,
        diameter: '10厘',
        size: null,
        hole: null,
        rodCount: null,
        extra: null,
      },
      {
        skuLabel: '拔丝料 · 6厘 (捆)',
        familyName: '拔丝料',
        condition: 'normal',
        unit: '捆',
        storageRoom: 40,
        warehouse: 0,
        total: 40,
        minimumLevel: 0,
        isLow: false,
        diameter: '6厘',
        size: null,
        hole: null,
        rodCount: null,
        extra: null,
      },
    ];
    const text = renderInventoryReport(rows, { businessDate: '2026-07-24' });
    const lines = text.split('\n');

    // First section header carries the date; the mesh family reports as 网片.
    expect(lines[0]).toBe('24/07/2026 网片库存');
    // Sorted by diameter descending within the family.
    expect(text).toContain('9厘 3×6 20孔 = 329张');
    expect(text).toContain('5.5厘 3×6 20孔 (15根) = 1173张');
    expect(text.indexOf('9厘 3×6 20孔 = 329张')).toBeLessThan(
      text.indexOf('5.5厘 3×6 20孔 (15根) = 1173张'),
    );

    // 螺纹盘圆 shortens to 盘圆 and uses the simple "剩余" style; 拔丝料 gets its own section.
    expect(text).toContain('盘圆');
    expect(text).toContain('10厘 剩余 10捆');
    expect(text).toContain('拔丝料');
    expect(text).toContain('6厘 剩余 40捆');

    expect(text).toContain('⚠️');
    expect(text).toContain('Low stock');
  });

  it('annotates non-normal condition and free-form extra specs in parentheses', () => {
    const rows: InventoryReportRow[] = [
      {
        skuLabel: '钢筋网 · 9厘 | 3×6 | 20孔 | Old (张)',
        familyName: '钢筋网',
        condition: 'old',
        unit: '张',
        storageRoom: 64,
        warehouse: 0,
        total: 64,
        minimumLevel: 0,
        isLow: false,
        diameter: '9厘',
        size: '3×6',
        hole: '20孔',
        rodCount: null,
        extra: null,
      },
      {
        skuLabel: '钢筋网 · 3.3厘 | 2×50 | 20孔 | Normal (卷)',
        familyName: '钢筋网',
        condition: 'normal',
        unit: '卷',
        storageRoom: 4,
        warehouse: 0,
        total: 4,
        minimumLevel: 0,
        isLow: false,
        diameter: '3.3厘',
        size: '2×50',
        hole: '20孔',
        rodCount: null,
        extra: '网卷',
      },
    ];
    const text = renderInventoryReport(rows, { businessDate: '2026-07-24' });
    expect(text).toContain('9厘 3×6 20孔 = 64张 (旧)');
    expect(text).toContain('3.3厘 2×50 20孔 = 4卷 (网卷)');
  });

  it('never includes an Incoming Purchases / supplier section', () => {
    const rows: InventoryReportRow[] = [
      {
        skuLabel: '钢筋网 · 9厘 | 3×6 | 20孔 | Normal (张)',
        familyName: '钢筋网',
        condition: 'normal',
        unit: '张',
        storageRoom: 279,
        warehouse: 50,
        total: 329,
        minimumLevel: 100,
        isLow: false,
        diameter: '9厘',
        size: '3×6',
        hole: '20孔',
        rodCount: null,
        extra: null,
      },
    ];
    const text = renderInventoryReport(rows, { businessDate: '2026-07-24' });
    expect(text).not.toMatch(/incoming purchases|采购在途/i);
  });
});
