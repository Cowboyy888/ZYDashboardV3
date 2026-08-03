import 'server-only';
import { buildBrandedXlsx, type BrandedColumn, type BrandedReportSpec } from './branded-xlsx';

export type { BrandedColumn, BrandedReportSpec, MetaPair, TotalRow } from './branded-xlsx';
export { buildBrandedXlsx, USD_FMT, NUM_FMT } from './branded-xlsx';

/** Column definition for a generated report (alias kept for existing callers). */
export type XlsxColumn<T> = BrandedColumn<T>;

/**
 * Build a single-sheet .xlsx workbook buffer from typed rows.
 *
 * Thin wrapper over the branded template (see branded-xlsx.ts) so every export
 * — including older callers that only pass a sheet name — renders with the ZY
 * Steel letterhead, red title bar and footer used by the printed invoice.
 * Prefer calling `buildBrandedXlsx` directly when the report has a proper
 * title, meta block, or totals to show.
 */
export async function buildXlsxBuffer<T>(
  sheetName: string,
  columns: XlsxColumn<T>[],
  rows: T[],
  extras: Partial<Omit<BrandedReportSpec<T>, 'sheetName' | 'columns' | 'rows'>> = {},
): Promise<Buffer> {
  return buildBrandedXlsx({
    sheetName,
    title: extras.title ?? `${sheetName.toUpperCase()} · 报表`,
    columns,
    rows,
    ...extras,
  });
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
