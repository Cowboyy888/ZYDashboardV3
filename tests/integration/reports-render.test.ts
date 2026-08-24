import { describe, it, expect } from 'vitest';
import { renderInventoryReport, type InventoryReportRow } from '@/lib/domain/reports';

describe('inventory report rendering', () => {
  it('renders a plain-language stock list split into Standard then Special sections, then a low-stock section', () => {
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
        specType: 'standard',
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
        specType: 'standard',
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
        specType: 'special',
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
        specType: 'special',
      },
    ];
    const text = renderInventoryReport(rows, { businessDate: '2026-07-24' });
    const lines = text.split('\n');

    // Date + title on the first line, then the Standard section header.
    expect(lines[0]).toBe('24/07/2026 库存报告 / Inventory Report');
    expect(text).toContain('标准规格 / Standard Specification (3×6 · 2.4×6)');
    expect(text).toContain('特殊规格 / Special Specification');
    expect(text.indexOf('标准规格')).toBeLessThan(text.indexOf('特殊规格'));

    // Both 3×6 mesh SKUs land in Standard, sorted by diameter descending.
    expect(text).toContain('9厘 3×6 20孔 = 329张');
    expect(text).toContain('5.5厘 3×6 20孔 (15根) = 1173张');
    expect(text.indexOf('特殊规格')).toBeGreaterThan(text.indexOf('9厘 3×6 20孔 = 329张'));
    expect(text.indexOf('9厘 3×6 20孔 = 329张')).toBeLessThan(
      text.indexOf('5.5厘 3×6 20孔 (15根) = 1173张'),
    );

    // Coil/wire SKUs (no size) land in Special, after the Standard section;
    // 螺纹盘圆 shortens to 盘圆 and uses the simple "剩余" style.
    expect(text.indexOf('标准规格')).toBeLessThan(text.indexOf('盘圆'));
    expect(text).toContain('盘圆');
    expect(text).toContain('10厘 剩余 10捆');
    expect(text).toContain('拔丝料');
    expect(text).toContain('6厘 剩余 40捆');

    expect(text).toContain('⚠️');
    expect(text).toContain('Low stock');
  });

  it('splits the same family across both sections when some of its SKUs are 3×6/2.4×6 and others are not', () => {
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
        specType: 'standard',
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
        specType: 'special',
      },
    ];
    const text = renderInventoryReport(rows, { businessDate: '2026-07-24' });
    expect(text).toContain('9厘 3×6 20孔 = 64张 (旧)');
    expect(text).toContain('3.3厘 2×50 20孔 = 4卷 (网卷)');
    // The 3×6 line is in Standard, the 2×50 line is in Special, in that order.
    expect(text.indexOf('9厘 3×6 20孔 = 64张 (旧)')).toBeLessThan(
      text.indexOf('3.3厘 2×50 20孔 = 4卷 (网卷)'),
    );
    expect(text.indexOf('特殊规格')).toBeGreaterThan(text.indexOf('9厘 3×6 20孔 = 64张 (旧)'));
    expect(text.indexOf('特殊规格')).toBeLessThan(text.indexOf('3.3厘 2×50 20孔 = 4卷 (网卷)'));
  });

  it('shows a "none" placeholder when a section has no rows, instead of omitting it', () => {
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
        specType: 'standard',
      },
    ];
    const text = renderInventoryReport(rows, { businessDate: '2026-07-24' });
    expect(text).toContain('特殊规格 / Special Specification');
    expect(text).toContain('（无 / none）');
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
        specType: 'standard',
      },
    ];
    const text = renderInventoryReport(rows, { businessDate: '2026-07-24' });
    expect(text).not.toMatch(/incoming purchases|采购在途/i);
  });
});
