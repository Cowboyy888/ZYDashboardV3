import 'server-only';
import { buildBrandedXlsx, USD_FMT, NUM_FMT, type BrandedColumn } from './branded-xlsx';
import {
  INQUIRY_REPORT_COLUMNS,
  formatUsd,
  type InquiryReportData,
  type InquiryReportRow,
} from './inquiry-report-html';

/**
 * Customer Price Inquiry report as a branded .xlsx — built on the shared ZY
 * Steel template (branded-xlsx.ts) so it is visually identical to every other
 * report and to the printed invoice. The columns themselves come from
 * inquiry-report-html.ts, which the print-to-PDF view also uses.
 */
export async function buildInquiryReportXlsx(data: InquiryReportData): Promise<Buffer> {
  const columns: BrandedColumn<InquiryReportRow>[] = INQUIRY_REPORT_COLUMNS.map((c) => ({
    header: c.header,
    width: c.width,
    align: c.kind === 'text' ? 'left' : 'right',
    numFmt: c.kind === 'usd' ? USD_FMT : c.kind === 'num' ? NUM_FMT : undefined,
    value: (row: InquiryReportRow) => {
      const v = row[c.key];
      if (c.kind === 'text') return (v as string) ?? '';
      return v == null || v === '' ? null : Number(v);
    },
  }));

  const s = data.summary;

  return buildBrandedXlsx({
    sheetName: 'Inquiry Report',
    title: 'CUSTOMER PRICE INQUIRY REPORT · 客户询价报告',
    metaLeft: [
      { label: 'REPORT:', value: 'Customer Price Inquiries 客户询价' },
      { label: 'BASIS:', value: 'Prices per square metre ($/m²) 单价按平方米' },
    ],
    metaRight: [
      { label: 'Generated:', value: data.generatedOn },
      { label: 'Inquiries:', value: String(s.totalInquiries) },
      { label: 'Currency:', value: 'US Dollar (USD)' },
    ],
    columns,
    rows: data.rows,
    totals: [
      { label: 'Quotation value 报价总额:', value: s.totalQuotationValue, numFmt: USD_FMT },
      { label: 'Won / Lost 成交/流失:', value: `${s.wonOrders} / ${s.lostOrders}` },
      { label: 'Conversion 成交率:', value: `${(s.conversionRate * 100).toFixed(0)}%` },
      { label: 'Pending 待跟进:', value: s.pendingFollowups },
      { label: 'WON PROFIT 成交利润:', value: s.wonProfit, numFmt: USD_FMT, highlight: true },
    ],
    notes: [
      'Price Difference = Quoted − Target ($/m²). 价差 = 报价 − 目标价。',
      'Estimated Profit = (Final or Quoted − Cost) × Area × Qty. 预估利润 =（成交价或报价 − 成本）× 面积 × 数量。',
      `Total quotation value across all inquiries: ${formatUsd(s.totalQuotationValue)}.`,
      'Confidential — internal sales report. 机密，内部销售报告。',
    ],
  });
}
