import 'server-only';
import { buildBrandedXlsx, NUM_FMT, type BrandedColumn } from './branded-xlsx';
import {
  PRICE_RECORD_REPORT_COLUMNS,
  type PriceRecordReportData,
  type PriceRecordReportRow,
} from './price-record-report-html';

/**
 * Price Record report as a branded .xlsx — built on the shared ZY Steel
 * template (branded-xlsx.ts). Columns come from price-record-report-html.ts,
 * which the print-to-PDF view also uses.
 */
export async function buildPriceRecordReportXlsx(data: PriceRecordReportData): Promise<Buffer> {
  const columns: BrandedColumn<PriceRecordReportRow>[] = PRICE_RECORD_REPORT_COLUMNS.map((c) => ({
    header: c.header,
    width: c.width,
    align: c.kind === 'text' ? 'left' : 'right',
    numFmt: c.kind === 'num' ? NUM_FMT : undefined,
    value: (row: PriceRecordReportRow) => {
      const v = row[c.key];
      if (c.kind === 'text') return (v as string) ?? '';
      return v == null || v === '' ? null : Number(v);
    },
  }));

  return buildBrandedXlsx({
    sheetName: 'Price Records',
    title: 'PRICE RECORD REPORT · 价格记录报告',
    metaLeft: [
      { label: 'REPORT:', value: 'Price History 价格历史' },
      { label: 'BASIS:', value: 'Reflects the filters currently applied 按当前筛选条件导出' },
    ],
    metaRight: [
      { label: 'Generated:', value: data.generatedOn },
      { label: 'Records:', value: String(data.rows.length) },
    ],
    columns,
    rows: data.rows,
    notes: [
      'A blank Customer means this price applies to all customers (standard pricing). 客户为空表示适用于所有客户（标准价格）。',
      'Confidential — internal pricing report. 机密，内部价格报告。',
    ],
  });
}
