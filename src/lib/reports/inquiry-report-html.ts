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
import { KHMER_FONT_FACE_CSS } from './fonts/noto-sans-khmer';

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
  { key: 'contact', header: 'Contact / Telegram 联系电话 / Telegram', width: 18, kind: 'text' },
  { key: 'type', header: 'Type 客户类型', width: 16, kind: 'text' },
  { key: 'product', header: 'Product 产品', width: 14, kind: 'text' },
  { key: 'spec', header: 'Spec 规格', width: 14, kind: 'text' },
  { key: 'diameter', header: 'Dia (mm) 直径', width: 10, kind: 'text' },
  { key: 'sheetSize', header: 'Sheet size 单张尺寸', width: 14, kind: 'text' },
  { key: 'meshOpening', header: 'Mesh opening 网孔尺寸', width: 14, kind: 'text' },
  { key: 'qty', header: 'Qty 数量', width: 10, kind: 'num' },
  { key: 'area', header: 'Area/sheet (m²) 单张面积', width: 14, kind: 'num' },
  { key: 'cost', header: 'Cost ($/m²) 成本', width: 13, kind: 'usd' },
  { key: 'quoted', header: 'Quoted ($/m²) 报价', width: 13, kind: 'usd' },
  { key: 'target', header: 'Target ($/m²) 目标价', width: 13, kind: 'usd' },
  { key: 'final', header: 'Final ($/m²) 成交价', width: 13, kind: 'usd' },
  { key: 'diff', header: 'Diff ($/m²) 价差', width: 12, kind: 'usd' },
  { key: 'profit', header: 'Est. Profit ($) 预估利润', width: 15, kind: 'usd' },
  { key: 'delivery', header: 'Delivery location 交货地点', width: 16, kind: 'text' },
  { key: 'status', header: 'Status 状态', width: 12, kind: 'text' },
  { key: 'followup', header: 'Follow-up 跟进日期', width: 13, kind: 'text' },
  { key: 'nextAction', header: 'Next action 下一步行动', width: 20, kind: 'text' },
  { key: 'followupNotes', header: 'Follow-up notes 跟进备注', width: 24, kind: 'text' },
  { key: 'remarks', header: 'Remarks 备注', width: 24, kind: 'text' },
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
    contact: i.contact ?? '',
    type: r.typeName(i.customer_type_id),
    product: r.familyName(i.family_id),
    spec: i.specification ?? '',
    diameter: i.diameter ?? '',
    sheetSize: i.sheet_size ?? '',
    meshOpening: i.mesh_opening ?? '',
    qty: i.quantity,
    area: i.area_per_sheet,
    cost: i.factory_cost,
    quoted: i.quoted_price,
    target: i.target_price,
    final: i.final_price,
    diff: i.price_difference,
    profit: i.estimated_profit,
    delivery: i.delivery_location ?? '',
    status: r.status(i.status_id)?.name ?? '',
    followup: i.follow_up_date ?? '',
    nextAction: i.next_action ?? '',
    followupNotes: i.follow_up_notes ?? '',
    remarks: i.remarks ?? '',
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

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const RED = '#e31e24';
const BANNER = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

/**
 * A self-contained, print-optimized HTML document for the inquiry report — the
 * exact layout of the ZY Steel printed invoice (letterhead, red title bar,
 * two-column meta block, bordered table, right-aligned totals with one
 * highlighted row, red footer strip), so the PDF and the .xlsx match.
 * Rendered to a real PDF server-side by pdf.ts (see
 * /api/export/inquiries/pdf) and downloaded directly.
 */
export function buildInquiryReportHtml(data: InquiryReportData): string {
  const s = data.summary;

  const metaRight: Array<[string, string]> = [
    ['Generated:', data.generatedOn],
    ['Inquiries:', String(s.totalInquiries)],
    ['Currency:', 'US Dollar (USD)'],
  ];

  const totals: Array<[string, string, boolean]> = [
    ['Quotation value 报价总额:', formatUsd(s.totalQuotationValue), false],
    ['Won / Lost 成交/流失:', `${s.wonOrders} / ${s.lostOrders}`, false],
    ['Conversion 成交率:', `${(s.conversionRate * 100).toFixed(0)}%`, false],
    ['Pending 待跟进:', String(s.pendingFollowups), false],
    ['WON PROFIT 成交利润:', formatUsd(s.wonProfit), true],
  ];

  const thead = INQUIRY_REPORT_COLUMNS.map(
    (c) => `<th class="${c.kind === 'text' ? 'l' : 'r'}">${esc(c.header)}</th>`,
  ).join('');

  const tbody =
    data.rows.length === 0
      ? `<tr><td class="empty" colspan="${INQUIRY_REPORT_COLUMNS.length}">No records for this report 暂无记录</td></tr>`
      : data.rows
          .map(
            (row) =>
              `<tr>${INQUIRY_REPORT_COLUMNS.map((c) => {
                const align = c.kind === 'text' ? 'l' : 'r';
                return `<td class="${align}">${esc(cellText(row[c.key] ?? null, c.kind))}</td>`;
              }).join('')}</tr>`,
          )
          .join('');

  const metaRightHtml = metaRight
    .map(([l, v]) => `<tr><td class="ml">${esc(l)}</td><td class="mv">${esc(v)}</td></tr>`)
    .join('');

  const totalsHtml = totals
    .map(
      ([l, v, hi]) =>
        `<tr class="${hi ? 'hi' : ''}"><td class="tl">${esc(l)}</td><td class="tv">${esc(v)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · Customer Price Inquiry Report</title>
<style>
${KHMER_FONT_FACE_CSS}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Noto Sans Khmer", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: ${INK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 20px;
  }
  /* --- Letterhead --- */
  .letterhead { display: flex; align-items: center; gap: 10px; }
  .logo { height: 42px; width: auto; }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: .3px; }
  .brand-zh { font-size: 12px; font-weight: 700; color: ${RED}; margin-top: 1px; }
  .sub { font-size: 9px; color: ${MUTED}; margin-top: 2px; }
  /* --- Red title bar --- */
  .bar {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 8px; margin: 14px 0 12px; font-size: 13px; letter-spacing: .3px;
  }
  /* --- Meta block --- */
  .meta { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
  .meta-l { font-size: 10px; }
  .meta-l .lbl { font-size: 9px; font-weight: 700; color: ${RED}; }
  .meta-l .val { font-size: 12px; font-weight: 700; }
  .meta-l .small { font-size: 9px; color: ${MUTED}; margin-top: 2px; }
  .meta-r td { font-size: 9px; padding: 1px 0; }
  .meta-r .ml { font-weight: 700; text-align: right; padding-right: 8px; }
  .meta-r .mv { text-align: right; }
  /* --- Table --- */
  table.data { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  table.data th, table.data td { border: 1px solid #bfbfbf; padding: 4px 5px; }
  table.data thead th { background: ${RED}; color: #fff; font-weight: 700; text-align: center; }
  table.data th.l, table.data td.l { text-align: left; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data tbody tr:nth-child(even) { background: #fafafa; }
  table.data td.empty { text-align: center; color: ${MUTED}; font-style: italic; padding: 14px; }
  /* --- Totals --- */
  .totals { margin-top: 10px; display: flex; justify-content: flex-end; }
  .totals table { border-collapse: collapse; font-size: 10px; }
  .totals .tl { text-align: right; font-weight: 700; padding: 3px 10px; }
  .totals .tv { text-align: right; font-weight: 700; padding: 3px 10px; border: 1px solid #bfbfbf; min-width: 110px; }
  .totals tr.hi .tl, .totals tr.hi .tv { background: ${BANNER}; color: ${RED}; }
  /* --- Notes + footer --- */
  .notes { margin-top: 14px; font-size: 8.5px; }
  .notes h4 { margin: 0 0 4px; font-size: 9.5px; color: ${RED}; }
  .notes ol { margin: 0; padding-left: 16px; }
  .notes li { margin-bottom: 2px; }
  .footer {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 6px; margin-top: 16px; font-size: 9px;
  }
  @page { size: A4 landscape; margin: 10mm; }
</style>
</head>
<body>
  <div class="letterhead">
    <img src="/brand/zysteel-logo.png" alt="ZY Steel 中粤铁网" class="logo" />
    <div>
      <div class="brand">ZY STEEL</div>
      <div class="brand-zh">中粤铁网</div>
      <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer</div>
      <div class="sub">Phnom Penh, Kingdom of Cambodia</div>
    </div>
  </div>

  <div class="bar">CUSTOMER PRICE INQUIRY REPORT · 客户询价报告</div>

  <div class="meta">
    <div class="meta-l">
      <div class="lbl">REPORT:</div>
      <div class="val">Customer Price Inquiries 客户询价</div>
      <div class="small">Prices per square metre ($/m²) 单价按平方米</div>
    </div>
    <table class="meta-r">${metaRightHtml}</table>
  </div>

  <table class="data">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>

  <div class="totals"><table>${totalsHtml}</table></div>

  <div class="notes">
    <h4>NOTES · 说明</h4>
    <ol>
      <li>Price Difference = Quoted − Target ($/m²). 价差 = 报价 − 目标价。</li>
      <li>Estimated Profit = (Final or Quoted − Cost) × Area × Qty. 预估利润 =（成交价或报价 − 成本）× 面积 × 数量。</li>
      <li>Confidential — internal sales report. 机密，内部销售报告。</li>
    </ol>
  </div>

  <div class="footer">ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business</div>
</body>
</html>`;
}
