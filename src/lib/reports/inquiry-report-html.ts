/**
 * Branded Customer Price Inquiry report — pure, no DOM / no server deps.
 *
 * Shared by BOTH exports so they stay identical:
 *   - the server .xlsx builder (inquiry-report-xlsx.ts), and
 *   - the client print-to-PDF (opens buildInquiryReportHtml() in a new window).
 *
 * Styling matches the ZY Steels price-list template: red/white letterhead, a
 * red section bar, a bordered table with USD formatting, and a red footer.
 * Headers are always bilingual (EN / 中文), like the source workbooks.
 */
import type { SalesInquiryRow } from '@/lib/db/types';
import type { InquirySummary, StatusCategory } from '@/lib/domain/sales-inquiry';

export type ColumnKind = 'text' | 'num' | 'usd';

export interface ReportColumn {
  key: string;
  header: string; // bilingual "English 中文"
  width: number; // Excel column width
  kind: ColumnKind;
}

/** Single source of truth for report columns (Excel + HTML iterate this). */
export const INQUIRY_REPORT_COLUMNS: ReportColumn[] = [
  { key: 'no', header: 'Inquiry No. 询价编号', width: 16, kind: 'text' },
  { key: 'date', header: 'Date 日期', width: 12, kind: 'text' },
  { key: 'salesperson', header: 'Salesperson 销售员', width: 14, kind: 'text' },
  { key: 'customer', header: 'Customer 客户', width: 20, kind: 'text' },
  { key: 'company', header: 'Company 公司', width: 18, kind: 'text' },
  { key: 'type', header: 'Type 客户类型', width: 16, kind: 'text' },
  { key: 'product', header: 'Product 产品', width: 14, kind: 'text' },
  { key: 'spec', header: 'Spec 规格', width: 14, kind: 'text' },
  { key: 'diameter', header: 'Dia (mm) 直径', width: 10, kind: 'text' },
  { key: 'qty', header: 'Qty 数量', width: 10, kind: 'num' },
  { key: 'area', header: 'Area/sheet (m²) 单张面积', width: 14, kind: 'num' },
  { key: 'cost', header: 'Cost ($/m²) 成本', width: 13, kind: 'usd' },
  { key: 'quoted', header: 'Quoted ($/m²) 报价', width: 13, kind: 'usd' },
  { key: 'target', header: 'Target ($/m²) 目标价', width: 13, kind: 'usd' },
  { key: 'final', header: 'Final ($/m²) 成交价', width: 13, kind: 'usd' },
  { key: 'diff', header: 'Diff ($/m²) 价差', width: 12, kind: 'usd' },
  { key: 'profit', header: 'Est. Profit ($) 预估利润', width: 15, kind: 'usd' },
  { key: 'status', header: 'Status 状态', width: 12, kind: 'text' },
  { key: 'followup', header: 'Follow-up 跟进日期', width: 13, kind: 'text' },
];

/** A report row: text columns hold strings, num/usd columns hold number|null. */
export type InquiryReportRow = Record<string, string | number | null>;

export interface InquiryReportData {
  generatedOn: string; // dd/mm/yyyy
  summary: InquirySummary;
  rows: InquiryReportRow[];
}

/** Resolvers turn stored ids into display names (client + server both supply these). */
export interface InquiryReportResolvers {
  salespersonName: (id: string | null) => string;
  typeName: (id: string | null) => string;
  familyName: (id: string | null) => string;
  status: (id: string | null) => { name: string; category: StatusCategory } | null;
}

/** Map a DB inquiry row to a display report row (uses derived generated columns). */
export function toReportRow(i: SalesInquiryRow, r: InquiryReportResolvers): InquiryReportRow {
  return {
    no: i.inquiry_no ?? '',
    date: i.inquiry_date,
    salesperson: r.salespersonName(i.salesperson_id),
    customer: i.customer_name,
    company: i.company_name ?? '',
    type: r.typeName(i.customer_type_id),
    product: r.familyName(i.family_id),
    spec: i.specification ?? '',
    diameter: i.diameter ?? '',
    qty: i.quantity,
    area: i.area_per_sheet,
    cost: i.factory_cost,
    quoted: i.quoted_price,
    target: i.target_price,
    final: i.final_price,
    diff: i.price_difference,
    profit: i.estimated_profit,
    status: r.status(i.status_id)?.name ?? '',
    followup: i.follow_up_date ?? '',
  };
}

export function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function formatNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** Render a display cell for the HTML report according to its column kind. */
export function cellText(value: string | number | null, kind: ColumnKind): string {
  if (kind === 'usd') return formatUsd(value as number | null);
  if (kind === 'num') return formatNum(value as number | null);
  const s = value == null ? '' : String(value);
  return s.length ? s : '—';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const RED = '#e31e24';
const HEADER_RED = '#b3141a';
const GREY = '#ededed';
const BANNER = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

/**
 * A self-contained, print-optimized HTML document for the inquiry report. The
 * client writes this into a new window and calls print() (Save as PDF).
 */
export function buildInquiryReportHtml(data: InquiryReportData): string {
  const s = data.summary;
  const kpis: Array<[string, string]> = [
    ['Inquiries 询价数', String(s.totalInquiries)],
    ['Quotation value 报价总额', formatUsd(s.totalQuotationValue)],
    ['Won 成交', String(s.wonOrders)],
    ['Lost 流失', String(s.lostOrders)],
    ['Conversion 成交率', `${(s.conversionRate * 100).toFixed(0)}%`],
    ['Won profit 成交利润', formatUsd(s.wonProfit)],
    ['Pending 待跟进', String(s.pendingFollowups)],
  ];

  const thead = INQUIRY_REPORT_COLUMNS.map(
    (c) => `<th class="${c.kind === 'text' ? 'l' : 'r'}">${esc(c.header)}</th>`,
  ).join('');

  const tbody =
    data.rows.length === 0
      ? `<tr><td class="empty" colspan="${INQUIRY_REPORT_COLUMNS.length}">No inquiries 暂无询价</td></tr>`
      : data.rows
          .map(
            (row) =>
              `<tr>${INQUIRY_REPORT_COLUMNS.map((c) => {
                const align = c.kind === 'text' ? 'l' : 'r';
                return `<td class="${align}">${esc(cellText(row[c.key] ?? null, c.kind))}</td>`;
              }).join('')}</tr>`,
          )
          .join('');

  const kpiCards = kpis
    .map(
      ([label, value]) =>
        `<div class="kpi"><div class="kpi-l">${esc(label)}</div><div class="kpi-v">${esc(value)}</div></div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steels · Customer Price Inquiry Report</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: ${INK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 22px;
  }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: .2px; }
  .sub { font-size: 10.5px; color: ${MUTED}; margin-top: 2px; }
  .bar {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 8px; margin: 14px 0; font-size: 14px; letter-spacing: .3px;
  }
  .meta { font-size: 10px; color: ${MUTED}; margin-bottom: 10px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .kpi { border: 1px solid ${GREY}; border-left: 3px solid ${RED}; padding: 6px 10px; min-width: 120px; }
  .kpi-l { font-size: 9px; color: ${MUTED}; text-transform: uppercase; }
  .kpi-v { font-size: 15px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th, td { border: 1px solid #cfcfcf; padding: 4px 5px; }
  thead th { background: ${HEADER_RED}; color: #fff; font-weight: 700; }
  th.l, td.l { text-align: left; }
  th.r, td.r { text-align: right; }
  tbody tr:nth-child(even) { background: #fafafa; }
  td.empty { text-align: center; color: ${MUTED}; padding: 16px; }
  .footer {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 6px; margin-top: 14px; font-size: 9px;
  }
  .note { font-size: 8.5px; font-style: italic; color: ${MUTED}; margin-top: 8px; }
  .conf {
    background: ${BANNER}; border-left: 4px solid ${RED}; color: ${INK};
    font-size: 9px; padding: 6px 10px; margin-bottom: 12px;
  }
  @page { size: A4 landscape; margin: 12mm; }
</style>
</head>
<body>
  <div class="brand">ZY Steels&nbsp;&nbsp;中粤铁网</div>
  <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer&nbsp;·&nbsp;Phnom Penh, Cambodia</div>
  <div class="conf">CONFIDENTIAL · 机密 — Internal sales report. Do not distribute outside ZY Steels. 内部销售报告，请勿外传。</div>
  <div class="bar">CUSTOMER PRICE INQUIRY REPORT · 客户询价报告</div>
  <div class="meta">Generated 生成日期: ${esc(data.generatedOn)} &nbsp;·&nbsp; Prices per square metre ($/m²) 单价按平方米</div>
  <div class="kpis">${kpiCards}</div>
  <table>
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>
  <div class="footer">ZY Steels 中粤铁网 · Confidential 机密 · Generated ${esc(data.generatedOn)}</div>
  <div class="note">Price Difference = Quoted − Target ($/m²). Estimated Profit = (Final or Quoted − Cost) × Area × Qty.</div>
</body>
</html>`;
}
