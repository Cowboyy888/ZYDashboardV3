import 'server-only';
import ExcelJS from 'exceljs';

/**
 * The ZY Steel branded report template — one builder every export uses, so all
 * reports look like the company's printed invoice.
 *
 * Layout (top to bottom), transcribed from ZY_Steel_Deposited_Invoice:
 *   1. Letterhead   — "ZY STEEL" bold black, "中粤铁网" red, two grey subtitle lines
 *   2. Title bar    — full-width red band, white bold centred (EN · 中文)
 *   3. Meta block   — left "REPORT FOR" pair(s), right label/value pairs
 *   4. Table        — red header row, thin-bordered cells, banded body
 *   5. Totals       — right-aligned label + boxed value; one highlighted row
 *   6. Notes        — numbered small print (optional)
 *   7. Footer bar   — full-width red band, white bold centred
 *
 * Callers describe WHAT to print (columns/rows/totals); this module owns HOW it
 * looks, so restyling every report later is a one-file change.
 */

// Palette taken from the invoice.
const RED = 'FFE31E24';
const PINK = 'FFFBF2F2';
const GREY_TEXT = 'FF6B6B6B';
const INK = 'FF1A1A1A';
const WHITE = 'FFFFFFFF';
const BORDER = 'FFBFBFBF';
const BAND = 'FFFAFAFA';

const FONT = 'Arial';
export const USD_FMT = '$#,##0.00';
export const NUM_FMT = '#,##0.###';

export type CellAlign = 'left' | 'center' | 'right';

export interface BrandedColumn<T> {
  /** Bilingual header, e.g. "Customer 客户". */
  header: string;
  width?: number;
  numFmt?: string;
  align?: CellAlign;
  value: (row: T) => string | number | Date | null;
}

export interface MetaPair {
  label: string;
  value: string;
}

export interface TotalRow {
  label: string;
  value: number | string;
  numFmt?: string;
  /** Renders on the pink/red highlight band, like "Deposit Due Now" on the invoice. */
  highlight?: boolean;
}

export interface BrandedReportSpec<T> {
  /** Excel sheet name (sanitised + truncated automatically). */
  sheetName: string;
  /** Red title-bar text, e.g. "SALES ORDERS REPORT · 销售订单报表". */
  title: string;
  /** Left meta block — typically who/what the report is for. */
  metaLeft?: MetaPair[];
  /** Right meta block — report no., date, currency, etc. */
  metaRight?: MetaPair[];
  columns: BrandedColumn<T>[];
  rows: T[];
  totals?: TotalRow[];
  /** Numbered small print under the table. */
  notes?: string[];
  /** Overrides the default footer strip text. */
  footer?: string;
}

const DEFAULT_FOOTER = 'ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business';

function thin(): Partial<ExcelJS.Borders> {
  const c = { argb: BORDER };
  return {
    top: { style: 'thin', color: c },
    bottom: { style: 'thin', color: c },
    left: { style: 'thin', color: c },
    right: { style: 'thin', color: c },
  };
}

/** Excel forbids * ? : \ / [ ] in sheet names and caps them at 31 chars. */
function safeSheetName(name: string): string {
  return name.replace(/[*?:\\/[\]]/g, '-').slice(0, 31) || 'Report';
}

/** Build a fully branded workbook buffer from a report spec. */
export async function buildBrandedXlsx<T>(spec: BrandedReportSpec<T>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zysteel Operations';
  workbook.created = new Date();

  const colCount = Math.max(spec.columns.length, 4);
  const sheet = workbook.addWorksheet(safeSheetName(spec.sheetName), {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  spec.columns.forEach((c, i) => (sheet.getColumn(i + 1).width = c.width ?? 18));

  let r = 1;
  const mergeFull = (row: number) => sheet.mergeCells(row, 1, row, colCount);

  // --- 1. Letterhead ----------------------------------------------------------
  mergeFull(r);
  const brand = sheet.getCell(r, 1);
  brand.value = 'ZY STEEL';
  brand.font = { name: FONT, size: 20, bold: true, color: { argb: INK } };
  brand.alignment = { vertical: 'middle' };
  sheet.getRow(r).height = 26;
  r++;

  mergeFull(r);
  const zh = sheet.getCell(r, 1);
  zh.value = '中粤铁网';
  zh.font = { name: FONT, size: 12, bold: true, color: { argb: RED } };
  r++;

  mergeFull(r);
  const sub1 = sheet.getCell(r, 1);
  sub1.value = 'Steel Mesh & Wire Drawing Manufacturer';
  sub1.font = { name: FONT, size: 9, color: { argb: GREY_TEXT } };
  r++;

  mergeFull(r);
  const sub2 = sheet.getCell(r, 1);
  sub2.value = 'Phnom Penh, Kingdom of Cambodia';
  sub2.font = { name: FONT, size: 9, color: { argb: GREY_TEXT } };
  r++;

  sheet.getRow(r).height = 6; // spacer
  r++;

  // --- 2. Red title bar -------------------------------------------------------
  mergeFull(r);
  const bar = sheet.getCell(r, 1);
  bar.value = spec.title;
  bar.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  bar.font = { name: FONT, size: 13, bold: true, color: { argb: WHITE } };
  bar.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(r).height = 24;
  r++;

  sheet.getRow(r).height = 8; // spacer
  r++;

  // --- 3. Meta block ----------------------------------------------------------
  const left = spec.metaLeft ?? [];
  const right = spec.metaRight ?? [];
  const metaRows = Math.max(left.length, right.length);
  if (metaRows > 0) {
    // Right block occupies the last two columns when the table is wide enough.
    const rightLabelCol = Math.max(1, colCount - 1);
    for (let i = 0; i < metaRows; i++) {
      const row = sheet.getRow(r);
      const l = left[i];
      if (l) {
        const lc = sheet.getCell(r, 1);
        lc.value = l.label ? `${l.label}` : '';
        lc.font = { name: FONT, size: 9, bold: true, color: { argb: RED } };
        const lv = sheet.getCell(r, 2);
        lv.value = l.value;
        lv.font = { name: FONT, size: 10, bold: true, color: { argb: INK } };
        lv.alignment = { horizontal: 'left' };
      }
      const rt = right[i];
      if (rt && colCount >= 3) {
        const rl = sheet.getCell(r, rightLabelCol);
        rl.value = rt.label;
        rl.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
        rl.alignment = { horizontal: 'right' };
        const rv = sheet.getCell(r, colCount);
        rv.value = rt.value;
        rv.font = { name: FONT, size: 9, color: { argb: INK } };
        rv.alignment = { horizontal: 'right' };
      }
      row.height = 15;
      r++;
    }
    sheet.getRow(r).height = 8; // spacer
    r++;
  }

  // --- 4. Table ---------------------------------------------------------------
  const headerRowIdx = r;
  const header = sheet.getRow(headerRowIdx);
  spec.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    cell.font = { name: FONT, size: 9.5, bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thin();
  });
  header.height = 28;
  r++;

  spec.rows.forEach((row, idx) => {
    const excelRow = sheet.getRow(r);
    spec.columns.forEach((c, i) => {
      const cell = excelRow.getCell(i + 1);
      const v = c.value(row);
      cell.value = v as ExcelJS.CellValue;
      if (c.numFmt) cell.numFmt = c.numFmt;
      const align: CellAlign = c.align ?? (typeof v === 'number' ? 'right' : 'left');
      cell.alignment = { horizontal: align, vertical: 'middle' };
      cell.font = { name: FONT, size: 9, color: { argb: INK } };
      cell.border = thin();
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
      }
    });
    r++;
  });

  if (spec.rows.length === 0) {
    sheet.mergeCells(r, 1, r, colCount);
    const empty = sheet.getCell(r, 1);
    empty.value = 'No records for this report 暂无记录';
    empty.font = { name: FONT, size: 9, italic: true, color: { argb: GREY_TEXT } };
    empty.alignment = { horizontal: 'center', vertical: 'middle' };
    empty.border = thin();
    r++;
  }

  // Filter + freeze the header so long reports stay navigable.
  sheet.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx, column: spec.columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRowIdx }];

  // --- 5. Totals block (right-aligned, like the invoice) ----------------------
  if (spec.totals?.length) {
    r++; // spacer
    const labelCol = Math.max(1, colCount - 1);
    for (const t of spec.totals) {
      const lc = sheet.getCell(r, labelCol);
      lc.value = t.label;
      lc.font = {
        name: FONT,
        size: 10,
        bold: true,
        color: { argb: t.highlight ? RED : INK },
      };
      lc.alignment = { horizontal: 'right', vertical: 'middle' };

      const vc = sheet.getCell(r, colCount);
      vc.value = t.value as ExcelJS.CellValue;
      if (t.numFmt) vc.numFmt = t.numFmt;
      vc.font = {
        name: FONT,
        size: 10,
        bold: true,
        color: { argb: t.highlight ? RED : INK },
      };
      vc.alignment = { horizontal: 'right', vertical: 'middle' };
      vc.border = thin();
      if (t.highlight) {
        const fill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PINK } };
        lc.fill = fill;
        vc.fill = fill;
      }
      sheet.getRow(r).height = 17;
      r++;
    }
  }

  // --- 6. Notes ---------------------------------------------------------------
  if (spec.notes?.length) {
    r++; // spacer
    mergeFull(r);
    const head = sheet.getCell(r, 1);
    head.value = 'NOTES · 说明';
    head.font = { name: FONT, size: 9.5, bold: true, color: { argb: RED } };
    r++;
    spec.notes.forEach((note, i) => {
      mergeFull(r);
      const cell = sheet.getCell(r, 1);
      cell.value = `${i + 1}. ${note}`;
      cell.font = { name: FONT, size: 8.5, color: { argb: INK } };
      cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      r++;
    });
  }

  // --- 7. Footer bar ----------------------------------------------------------
  r++; // spacer
  mergeFull(r);
  const footer = sheet.getCell(r, 1);
  footer.value = spec.footer ?? DEFAULT_FOOTER;
  footer.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
  footer.font = { name: FONT, size: 9, bold: true, color: { argb: WHITE } };
  footer.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(r).height = 18;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
