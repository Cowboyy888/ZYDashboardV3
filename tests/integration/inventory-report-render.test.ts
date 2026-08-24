import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  buildInventoryReportHtml,
  type InventoryReportData,
} from '@/lib/reports/inventory-report-html';
import { buildInventoryReportXlsx } from '@/lib/reports/inventory-report-xlsx';
import type { InventoryReportRow } from '@/lib/domain/inventory-view';

const rows: InventoryReportRow[] = [
  {
    skuId: 'sku-standard-1',
    familyId: 'fam-mesh',
    familyName: '钢筋网',
    label: '钢筋网 · 9厘 | 3×6 | 20孔 | Normal (张)',
    diameter: '9厘',
    size: '3×6',
    hole: '20孔',
    notes: null,
    specType: 'standard',
    condition: 'normal',
    unit: '张',
    minimumLevel: 100,
    storageRoom: 279,
    warehouse: 50,
    other: 0,
    total: 329,
    isLow: false,
    reserved: 50,
    available: 279,
    customerProject: '—',
  },
  {
    skuId: 'sku-special-1',
    familyId: 'fam-mesh',
    familyName: '钢筋网',
    label: '钢筋网 · 9厘 | 4×8 | 20孔 | Normal (张)',
    diameter: '9厘',
    size: '4×8',
    hole: '20孔',
    notes: 'Custom project spec',
    specType: 'special',
    condition: 'normal',
    unit: '张',
    minimumLevel: 20,
    storageRoom: 10,
    warehouse: 0,
    other: 0,
    total: 10,
    isLow: true,
    reserved: 4,
    available: 6,
    customerProject: 'ABC Construction',
  },
];

const data: InventoryReportData = { generatedOn: '24/08/2026', rows };

describe('Inventory Report — HTML (PDF source)', () => {
  it('renders Standard specification before Special specification, each in its own section', () => {
    const html = buildInventoryReportHtml(data);
    expect(html.indexOf('STANDARD SPECIFICATION')).toBeGreaterThan(-1);
    expect(html.indexOf('SPECIAL SPECIFICATION')).toBeGreaterThan(-1);
    expect(html.indexOf('STANDARD SPECIFICATION')).toBeLessThan(
      html.indexOf('SPECIAL SPECIFICATION'),
    );
    // Standard SKU row appears before the Special SKU row.
    expect(html.indexOf('9厘')).toBeLessThan(html.lastIndexOf('4×8'));
  });

  it('includes Reserved/Available figures and the Customer/Project column only for Special', () => {
    const html = buildInventoryReportHtml(data);
    expect(html).toContain('ABC Construction');
    expect(html).toContain('Total Reserved');
    expect(html).toContain('Total Available');
  });

  it('embeds Khmer font-face CSS so the PDF renderer can display Khmer text', () => {
    const html = buildInventoryReportHtml(data);
    expect(html).toContain('@font-face');
    expect(html).toContain('Noto Sans Khmer');
  });

  it('shows an empty-section message when a section has no rows', () => {
    const html = buildInventoryReportHtml({ generatedOn: '24/08/2026', rows: [] });
    expect(html).toContain('No records for this section');
  });
});

describe('Inventory Report — Excel', () => {
  async function build() {
    const buffer = await buildInventoryReportXlsx(data);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    return wb.worksheets[0]!;
  }

  it('renders both section headers with Standard before Special', async () => {
    const ws = await build();
    let standardRow = 0;
    let specialRow = 0;
    ws.eachRow((row, n) => {
      const v = String(row.getCell(1).value ?? '');
      if (v.includes('STANDARD SPECIFICATION')) standardRow = n;
      if (v.includes('SPECIAL SPECIFICATION')) specialRow = n;
    });
    expect(standardRow).toBeGreaterThan(0);
    expect(specialRow).toBeGreaterThan(0);
    expect(standardRow).toBeLessThan(specialRow);
  });

  it('includes the Type, Reserved, Available and Customer/Project columns', () => {
    return build().then((ws) => {
      const values: string[] = [];
      ws.eachRow((row) => row.eachCell((c) => values.push(String(c.value ?? ''))));
      expect(values.join(' ')).toContain('Reserved 预留');
      expect(values.join(' ')).toContain('Available 可用');
      expect(values.join(' ')).toContain('Customer/Project 客户/项目');
      expect(values).toContain('ABC Construction');
    });
  });

  it('renders the ZY Steel letterhead and footer, like every other export', async () => {
    const ws = await build();
    expect(ws.getCell('A1').value).toBe('ZY STEEL');
    let footer = false;
    ws.eachRow((row) =>
      row.eachCell((c) => {
        if (String(c.value ?? '').includes('Thank you for your business')) footer = true;
      }),
    );
    expect(footer).toBe(true);
  });
});
