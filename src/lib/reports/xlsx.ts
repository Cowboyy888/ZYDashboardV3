import 'server-only';
import ExcelJS from 'exceljs';

/** Brand red (matches `--primary: 354 74% 45%` in globals.css) as an ARGB hex. */
const BRAND_RED = 'FFC81E2F';

export interface XlsxColumn<T> {
  header: string;
  width?: number;
  numFmt?: string;
  value: (row: T) => string | number | Date | null;
}

/**
 * Build a single-sheet .xlsx workbook buffer from typed rows — used by the
 * `/api/export/*` route handlers backing each module's "Export to Excel"
 * button. Header row gets the brand-red fill so exported reports read as
 * clearly ZY Steel's, matching the printed sales-order letterhead.
 */
export async function buildXlsxBuffer<T>(
  sheetName: string,
  columns: XlsxColumn<T>[],
  rows: T[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Zysteel Operations';
  workbook.created = new Date();

  // Excel sheet names: no *?:\/[] and a 31-char cap — strip/truncate rather
  // than let a caller-supplied date-formatted title (e.g. "16/07/2026") crash
  // the whole export.
  const safeSheetName = sheetName.replace(/[*?:\\/[\]]/g, '-').slice(0, 31);
  const sheet = workbook.addWorksheet(safeSheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 18 }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_RED } };
  headerRow.alignment = { vertical: 'middle' };

  for (const row of rows) {
    const values = columns.map((c) => c.value(row));
    const excelRow = sheet.addRow(values);
    columns.forEach((c, i) => {
      if (c.numFmt) excelRow.getCell(i + 1).numFmt = c.numFmt;
    });
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Wrap a generated buffer as a downloadable .xlsx HTTP response. */
export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), { headers: xlsxHeaders(filename) });
}

/** Standard download headers for a generated .xlsx response. */
export function xlsxHeaders(filename: string): HeadersInit {
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename}"`,
  };
}
