import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildBrandedXlsx, USD_FMT } from '@/lib/reports/branded-xlsx';

interface Row {
  name: string;
  qty: number;
  amount: number;
}

const rows: Row[] = [
  { name: 'Welded Steel Mesh 钢网', qty: 300, amount: 7905.6 },
  { name: 'Wire Drawing 拔丝料', qty: 120, amount: 1500 },
];

async function build() {
  const buffer = await buildBrandedXlsx<Row>({
    sheetName: 'Test Report',
    title: 'TEST REPORT · 测试报表',
    metaLeft: [{ label: 'REPORT:', value: 'Test 测试' }],
    metaRight: [
      { label: 'Generated:', value: '28/07/2026' },
      { label: 'Currency:', value: 'US Dollar (USD)' },
    ],
    columns: [
      { header: 'Product 产品', width: 30, value: (r) => r.name },
      { header: 'Qty 数量', width: 10, value: (r) => r.qty, numFmt: '#,##0' },
      { header: 'Amount 金额', width: 14, value: (r) => r.amount, numFmt: USD_FMT },
    ],
    rows,
    totals: [
      { label: 'Subtotal 小计:', value: 9405.6, numFmt: USD_FMT },
      { label: 'TOTAL DUE 应付:', value: 9405.6, numFmt: USD_FMT, highlight: true },
    ],
    notes: ['A note. 一条说明。'],
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}

describe('branded report template (matches the ZY Steel invoice UI)', () => {
  it('renders the letterhead in the ZY Steel house style', async () => {
    const ws = await build();
    expect(ws.getCell('A1').value).toBe('ZY STEEL');
    expect(ws.getCell('A1').font?.bold).toBe(true);
    expect(ws.getCell('A2').value).toBe('中粤铁网');
    // Chinese company name is red, like the invoice.
    expect(ws.getCell('A2').font?.color?.argb).toBe('FFE31E24');
    expect(String(ws.getCell('A3').value)).toContain('Steel Mesh');
    expect(String(ws.getCell('A4').value)).toContain('Phnom Penh');
  });

  it('renders a full-width red title bar with white bold text', async () => {
    const ws = await build();
    const bar = ws.getCell('A6');
    expect(bar.value).toBe('TEST REPORT · 测试报表');
    expect((bar.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe('FFE31E24');
    expect(bar.font?.color?.argb).toBe('FFFFFFFF');
    expect(bar.font?.bold).toBe(true);
    expect(bar.alignment?.horizontal).toBe('center');
  });

  it('renders the meta block on both sides', async () => {
    const ws = await build();
    // Left label is red; right-hand pairs sit in the last columns.
    const found: string[] = [];
    ws.eachRow((row) => row.eachCell((c) => found.push(String(c.value ?? ''))));
    expect(found).toContain('REPORT:');
    expect(found).toContain('Test 测试');
    expect(found).toContain('Generated:');
    expect(found).toContain('28/07/2026');
  });

  it('renders a red table header and the data rows', async () => {
    const ws = await build();
    let headerRow = 0;
    ws.eachRow((row, n) => {
      if (String(row.getCell(1).value ?? '') === 'Product 产品') headerRow = n;
    });
    expect(headerRow).toBeGreaterThan(0);

    const h = ws.getCell(headerRow, 1);
    expect((h.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe('FFE31E24');
    expect(h.font?.color?.argb).toBe('FFFFFFFF');

    // First data row carries the values and the money format.
    expect(ws.getCell(headerRow + 1, 1).value).toBe('Welded Steel Mesh 钢网');
    expect(ws.getCell(headerRow + 1, 3).value).toBe(7905.6);
    expect(ws.getCell(headerRow + 1, 3).numFmt).toBe(USD_FMT);
  });

  it('renders totals with one highlighted row, like the invoice', async () => {
    const ws = await build();
    let highlighted: ExcelJS.Cell | null = null;
    ws.eachRow((row) =>
      row.eachCell((c) => {
        if (String(c.value ?? '') === 'TOTAL DUE 应付:') highlighted = c;
      }),
    );
    expect(highlighted).not.toBeNull();
    const cell = highlighted as unknown as ExcelJS.Cell;
    expect((cell.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe('FFFBF2F2');
    expect(cell.font?.color?.argb).toBe('FFE31E24');
  });

  it('ends with the red footer strip', async () => {
    const ws = await build();
    let footer: ExcelJS.Cell | null = null;
    ws.eachRow((row) =>
      row.eachCell((c) => {
        if (String(c.value ?? '').includes('Thank you for your business')) footer = c;
      }),
    );
    expect(footer).not.toBeNull();
    const cell = footer as unknown as ExcelJS.Cell;
    expect((cell.fill as ExcelJS.FillPattern)?.fgColor?.argb).toBe('FFE31E24');
    expect(cell.font?.color?.argb).toBe('FFFFFFFF');
  });

  it('shows an empty-state row when there is no data', async () => {
    const buffer = await buildBrandedXlsx<Row>({
      sheetName: 'Empty',
      title: 'EMPTY · 空',
      columns: [{ header: 'Product 产品', value: (r) => r.name }],
      rows: [],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    let seen = false;
    ws.eachRow((row) =>
      row.eachCell((c) => {
        if (String(c.value ?? '').includes('No records')) seen = true;
      }),
    );
    expect(seen).toBe(true);
  });

  it('sanitises invalid Excel sheet names', async () => {
    const buffer = await buildBrandedXlsx<Row>({
      sheetName: 'Payroll 01/07/2026 to 31/07/2026 [draft]',
      title: 'X',
      columns: [{ header: 'A', value: (r) => r.name }],
      rows: [],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const name = wb.worksheets[0]!.name;
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name).not.toMatch(/[*?:\\/[\]]/);
  });
});
