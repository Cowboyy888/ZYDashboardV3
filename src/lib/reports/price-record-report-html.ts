/**
 * Branded Price Record report — pure, no DOM / no server deps.
 *
 * Shared by BOTH exports so they stay identical:
 *   - the server .xlsx builder (price-record-report-xlsx.ts), and
 *   - the server-rendered PDF (see /api/export/price-records/pdf).
 *
 * One flat table (no summary/totals block — a price ledger has no dollar
 * total worth rolling up, unlike Inquiries' quotation-value summary), same
 * letterhead/title-bar/footer look as every other ZY Steel report.
 */
import type { PriceRecordRow } from '@/lib/db/types';
import { KHMER_FONT_FACE_CSS } from './fonts/noto-sans-khmer';

export type ColumnKind = 'text' | 'num';

export interface ReportColumn {
  key: string;
  header: string; // bilingual "English 中文"
  width: number; // Excel column width
  kind: ColumnKind;
}

/** Single source of truth for report columns (Excel + HTML iterate this). */
export const PRICE_RECORD_REPORT_COLUMNS: ReportColumn[] = [
  { key: 'product', header: 'Product 产品', width: 16, kind: 'text' },
  { key: 'spec', header: 'Specification 规格', width: 26, kind: 'text' },
  { key: 'customer', header: 'Customer 客户', width: 20, kind: 'text' },
  { key: 'price', header: 'Price 价格', width: 12, kind: 'num' },
  { key: 'currency', header: 'Currency 币种', width: 9, kind: 'text' },
  { key: 'unit', header: 'Unit 单位', width: 9, kind: 'text' },
  { key: 'priceType', header: 'Price Type 价格类型', width: 15, kind: 'text' },
  { key: 'effectiveDate', header: 'Effective Date 生效日期', width: 13, kind: 'text' },
  { key: 'expiryDate', header: 'Expiry Date 失效日期', width: 13, kind: 'text' },
  { key: 'status', header: 'Status 状态', width: 10, kind: 'text' },
  { key: 'createdBy', header: 'Created By 录入人', width: 16, kind: 'text' },
  { key: 'notes', header: 'Notes 备注', width: 24, kind: 'text' },
];

/** A report row: text columns hold strings, num columns hold number|null. */
export type PriceRecordReportRow = Record<string, string | number | null>;

export interface PriceRecordReportData {
  generatedOn: string; // dd/mm/yyyy
  rows: PriceRecordReportRow[];
}

/** Resolvers turn stored ids into display names (client + server both supply these). */
export interface PriceRecordReportResolvers {
  skuLabel: (skuId: string) => string;
  skuFamilyName: (skuId: string) => string;
  customerName: (id: string | null) => string;
  priceTypeName: (id: string) => string;
  createdByName: (id: string | null) => string;
}

/** Map a DB price_records row to a display report row. */
export function toReportRow(
  p: PriceRecordRow,
  r: PriceRecordReportResolvers,
): PriceRecordReportRow {
  return {
    product: r.skuFamilyName(p.sku_id),
    spec: r.skuLabel(p.sku_id),
    customer: p.customer_id ? r.customerName(p.customer_id) : 'Standard (all customers)',
    price: p.price,
    currency: p.currency,
    unit: p.unit,
    priceType: r.priceTypeName(p.price_type_id),
    effectiveDate: p.effective_date,
    expiryDate: p.expiry_date ?? '',
    status: p.status,
    createdBy: r.createdByName(p.created_by),
    notes: p.notes ?? '',
  };
}

export function formatNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** Render a display cell for the HTML report according to its column kind. */
export function cellText(value: string | number | null, kind: ColumnKind): string {
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
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

/**
 * A self-contained, print-optimized HTML document for the Price Record report.
 * Rendered to a real PDF server-side by pdf.ts (see /api/export/price-records/pdf).
 */
export function buildPriceRecordReportHtml(data: PriceRecordReportData): string {
  const metaRight: Array<[string, string]> = [
    ['Generated:', data.generatedOn],
    ['Records:', String(data.rows.length)],
  ];

  const thead = PRICE_RECORD_REPORT_COLUMNS.map(
    (c) => `<th class="${c.kind === 'text' ? 'l' : 'r'}">${esc(c.header)}</th>`,
  ).join('');

  const tbody =
    data.rows.length === 0
      ? `<tr><td class="empty" colspan="${PRICE_RECORD_REPORT_COLUMNS.length}">No records for this report 暂无记录</td></tr>`
      : data.rows
          .map(
            (row) =>
              `<tr>${PRICE_RECORD_REPORT_COLUMNS.map((c) => {
                const align = c.kind === 'text' ? 'l' : 'r';
                return `<td class="${align}">${esc(cellText(row[c.key] ?? null, c.kind))}</td>`;
              }).join('')}</tr>`,
          )
          .join('');

  const metaRightHtml = metaRight
    .map(([l, v]) => `<tr><td class="ml">${esc(l)}</td><td class="mv">${esc(v)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · Price Record Report</title>
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
  .letterhead { display: flex; align-items: center; gap: 10px; }
  .logo { height: 42px; width: auto; }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: .3px; }
  .brand-zh { font-size: 12px; font-weight: 700; color: ${RED}; margin-top: 1px; }
  .sub { font-size: 9px; color: ${MUTED}; margin-top: 2px; }
  .bar {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 8px; margin: 14px 0 12px; font-size: 13px; letter-spacing: .3px;
  }
  .meta { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
  .meta-l { font-size: 10px; }
  .meta-l .lbl { font-size: 9px; font-weight: 700; color: ${RED}; }
  .meta-l .val { font-size: 12px; font-weight: 700; }
  .meta-l .small { font-size: 9px; color: ${MUTED}; margin-top: 2px; }
  .meta-r td { font-size: 9px; padding: 1px 0; }
  .meta-r .ml { font-weight: 700; text-align: right; padding-right: 8px; }
  .meta-r .mv { text-align: right; }
  table.data { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  table.data th, table.data td { border: 1px solid #bfbfbf; padding: 4px 5px; }
  table.data thead th { background: ${RED}; color: #fff; font-weight: 700; text-align: center; }
  table.data th.l, table.data td.l { text-align: left; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data tbody tr:nth-child(even) { background: #fafafa; }
  table.data td.empty { text-align: center; color: ${MUTED}; font-style: italic; padding: 14px; }
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

  <div class="bar">PRICE RECORD REPORT · 价格记录报告</div>

  <div class="meta">
    <div class="meta-l">
      <div class="lbl">REPORT:</div>
      <div class="val">Price History 价格历史</div>
      <div class="small">Reflects the filters currently applied on-screen 按当前筛选条件导出</div>
    </div>
    <table class="meta-r">${metaRightHtml}</table>
  </div>

  <table class="data">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>

  <div class="notes">
    <h4>NOTES · 说明</h4>
    <ol>
      <li>A blank Customer means this price applies to all customers (standard pricing). 客户为空表示适用于所有客户（标准价格）。</li>
      <li>Confidential — internal pricing report. 机密，内部价格报告。</li>
    </ol>
  </div>

  <div class="footer">ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business</div>
</body>
</html>`;
}
