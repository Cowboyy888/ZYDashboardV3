import 'server-only';
import ExcelJS from 'exceljs';
import { totalsBySpecTypeUnit, type InventoryReportRow } from '@/lib/domain/inventory-view';
import {
  INVENTORY_REPORT_COLUMNS,
  columnsForSection,
  reportCellValue,
  combinedUnitTotals,
  formatNum,
  type InventoryReportData,
} from './inventory-report-html';

/**
 * Inventory Report as a branded .xlsx — Standard specification first, Special
 * second, each its own clearly separated table in one sheet (branded-xlsx.ts
 * only supports a single table per sheet, so this builds directly on ExcelJS,
 * reusing the same ZY Steel palette/letterhead/footer look).
 */
const RED = 'FFE31E24';
const PINK = 'FFFBF2F2';
const GREY_TEXT = 'FF6B6B6B';
const INK = 'FF1A1A1A';
const WHITE = 'FFFFFFFF';
const BORDER = 'FFBFBFBF';
const BAND = 'FFFAFAFA';
const FONT = 'Arial';
const NUM_FMT = '#,##0.###';

function thin(): Partial<ExcelJS.Borders> {
  const c = { argb: BORDER };
  return {
    top: { style: 'thin', color: c },
    bottom: { style: 'thin', color: c },
    left: { style: 'thin', color: c },
    right: { style: 'thin', color: c },
  };
}

export async function buildInventoryReportXlsx(data: InventoryReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zysteel Operations';
  workbook.created = new Date();

  const colCount = INVENTORY_REPORT_COLUMNS.length;
  const sheet = workbook.addWorksheet('Inventory Report', {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  INVENTORY_REPORT_COLUMNS.forEach((c, i) => (sheet.getColumn(i + 1).width = c.width));

  let r = 1;
  const mergeFull = (row: number) => sheet.mergeCells(row, 1, row, colCount);

  mergeFull(r);
  sheet.getCell(r, 1).value = 'ZY STEEL';
  sheet.getCell(r, 1).font = { name: FONT, size: 20, bold: true, color: { argb: INK } };
  sheet.getRow(r).height = 26;
  r++;
  mergeFull(r);
  sheet.getCell(r, 1).value = '中粤铁网';
  sheet.getCell(r, 1).font = { name: FONT, size: 12, bold: true, color: { argb: RED } };
  r++;
  mergeFull(r);
  sheet.getCell(r, 1).value = 'Steel Mesh & Wire Drawing Manufacturer';
  sheet.getCell(r, 1).font = { name: FONT, size: 9, color: { argb: GREY_TEXT } };
  r++;
  mergeFull(r);
  sheet.getCell(r, 1).value = 'Phnom Penh, Kingdom of Cambodia';
  sheet.getCell(r, 1).font = { name: FONT, size: 9, color: { argb: GREY_TEXT } };
  r++;
  sheet.getRow(r).height = 6;
  r++;

  mergeFull(r);
  const bar = sheet.getCell(r, 1);
  bar.value = 'INVENTORY REPORT · 库存报表';
  bar.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  bar.font = { name: FONT, size: 13, bold: true, color: { argb: WHITE } };
  bar.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(r).height = 24;
  r++;
  sheet.getRow(r).height = 8;
  r++;

  const lowCount = data.rows.filter((row) => row.isLow).length;
  const metaRight: Array<[string, string]> = [
    ['Generated:', data.generatedOn],
    ['Specifications:', String(data.rows.length)],
    ['Low stock:', String(lowCount)],
  ];
  const rightLabelCol = Math.max(1, colCount - 1);
  const metaStartRow = r;
  for (const [label, value] of metaRight) {
    if (r === metaStartRow) {
      const lc = sheet.getCell(r, 1);
      lc.value = 'REPORT:';
      lc.font = { name: FONT, size: 9, bold: true, color: { argb: RED } };
      const lv = sheet.getCell(r, 2);
      lv.value = 'Standard vs Special Specification 标准与特殊规格';
      lv.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
    }
    const rl = sheet.getCell(r, rightLabelCol);
    rl.value = label;
    rl.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
    rl.alignment = { horizontal: 'right' };
    const rv = sheet.getCell(r, colCount);
    rv.value = value;
    rv.font = { name: FONT, size: 9, color: { argb: INK } };
    rv.alignment = { horizontal: 'right' };
    sheet.getRow(r).height = 15;
    r++;
  }
  r++; // spacer

  function renderSection(
    label: string,
    rows: InventoryReportRow[],
    section: 'standard' | 'special',
  ) {
    mergeFull(r);
    const head = sheet.getCell(r, 1);
    head.value = label;
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK } };
    head.font = { name: FONT, size: 11, bold: true, color: { argb: RED } };
    head.alignment = { vertical: 'middle' };
    sheet.getRow(r).height = 20;
    r++;

    const columns = columnsForSection(section);
    const headerRowIdx = r;
    const headerRow = sheet.getRow(headerRowIdx);
    columns.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
      cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: WHITE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thin();
    });
    headerRow.height = 26;
    r++;

    rows.forEach((row, idx) => {
      const excelRow = sheet.getRow(r);
      columns.forEach((c, i) => {
        const cell = excelRow.getCell(i + 1);
        const v = reportCellValue(row, c.key);
        cell.value = c.kind === 'num' ? (v as number) : ((v as string) ?? '');
        if (c.kind === 'num') cell.numFmt = NUM_FMT;
        cell.alignment = { horizontal: c.kind === 'num' ? 'right' : 'left', vertical: 'middle' };
        cell.font = { name: FONT, size: 9, color: { argb: INK } };
        cell.border = thin();
        if (idx % 2 === 1)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      });
      r++;
    });

    if (rows.length === 0) {
      sheet.mergeCells(r, 1, r, columns.length);
      const empty = sheet.getCell(r, 1);
      empty.value = 'No records for this section 暂无记录';
      empty.font = { name: FONT, size: 9, italic: true, color: { argb: GREY_TEXT } };
      empty.alignment = { horizontal: 'center', vertical: 'middle' };
      empty.border = thin();
      r++;
    }
    r++; // spacer
  }

  const standardRows = data.rows.filter((row) => row.specType === 'standard');
  const specialRows = data.rows.filter((row) => row.specType === 'special');
  renderSection('STANDARD SPECIFICATION · 标准规格 (3×6m | 2.4×6m)', standardRows, 'standard');
  renderSection(
    'SPECIAL SPECIFICATION · 特殊规格 (All other sizes 其他所有尺寸)',
    specialRows,
    'special',
  );

  const unitTotals = totalsBySpecTypeUnit(data.rows);
  const { reservedByUnit, availableByUnit } = combinedUnitTotals(unitTotals);
  const totalsRows: Array<[string, string, boolean]> = [
    [
      'Total Reserved 预留合计:',
      reservedByUnit.map((u) => `${formatNum(u.value)} ${u.unit}`).join(' · ') || '—',
      false,
    ],
    [
      'Total Available 可用合计:',
      availableByUnit.map((u) => `${formatNum(u.value)} ${u.unit}`).join(' · ') || '—',
      true,
    ],
  ];
  const labelCol = Math.max(1, colCount - 2);
  for (const [label, value, highlight] of totalsRows) {
    const lc = sheet.getCell(r, labelCol);
    lc.value = label;
    lc.font = { name: FONT, size: 10, bold: true, color: { argb: highlight ? RED : INK } };
    lc.alignment = { horizontal: 'right', vertical: 'middle' };
    sheet.mergeCells(r, colCount - 1, r, colCount);
    const vc = sheet.getCell(r, colCount - 1);
    vc.value = value;
    vc.font = { name: FONT, size: 10, bold: true, color: { argb: highlight ? RED : INK } };
    vc.alignment = { horizontal: 'right', vertical: 'middle' };
    vc.border = thin();
    if (highlight) {
      lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK } };
      vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK } };
    }
    sheet.getRow(r).height = 17;
    r++;
  }

  r++; // spacer
  mergeFull(r);
  const notesHead = sheet.getCell(r, 1);
  notesHead.value = 'NOTES · 说明';
  notesHead.font = { name: FONT, size: 9.5, bold: true, color: { argb: RED } };
  r++;
  const notes = [
    'Specification type is calculated automatically from Size — never manually entered. 规格类型根据尺寸自动计算，非手动录入。',
    'Reserved = outstanding quantity on confirmed sales orders not yet delivered. 预留 = 已确认但尚未发货的销售订单数量。',
    'Available = physical stock − reserved. 可用 = 实际库存 − 预留。',
    'Confidential — internal inventory report. 机密，内部库存报告。',
  ];
  notes.forEach((note, i) => {
    mergeFull(r);
    const cell = sheet.getCell(r, 1);
    cell.value = `${i + 1}. ${note}`;
    cell.font = { name: FONT, size: 8.5, color: { argb: INK } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    r++;
  });

  r++; // spacer
  mergeFull(r);
  const footer = sheet.getCell(r, 1);
  footer.value = 'ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business';
  footer.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  footer.font = { name: FONT, size: 9, bold: true, color: { argb: WHITE } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(r).height = 18;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
