/**
 * Branded Purchase Orders report — pure, no DOM / no server deps.
 *
 * Shared by BOTH exports so they stay identical:
 *   - the server .xlsx builder (api/export/purchasing/route.ts), and
 *   - the client print-to-PDF (opens buildPurchaseOrderReportHtml() in a new window).
 *
 * Styling matches inquiry-report-html.ts's ZY Steel letterhead template —
 * red/white letterhead, a red section bar, a bordered table, a red footer —
 * duplicated on purpose (no shared-utils module exists yet in this repo).
 */
import type { PurchaseOrderRow, PoItemRow } from '@/lib/domain/purchasing-view';

export type PoReportColumnKind = 'text' | 'num' | 'usd';

export interface PoReportColumn {
  key: string;
  header: string; // bilingual "English 中文"
  width: number; // Excel column width
  kind: PoReportColumnKind;
}

/** Single source of truth for report columns (Excel + HTML iterate this). */
export const PO_REPORT_COLUMNS: PoReportColumn[] = [
  { key: 'poNumber', header: 'PO Number 采购单号', width: 16, kind: 'text' },
  { key: 'supplier', header: 'Supplier 供应商', width: 22, kind: 'text' },
  { key: 'orderDate', header: 'Order Date 下单日期', width: 13, kind: 'text' },
  { key: 'status', header: 'Status 状态', width: 14, kind: 'text' },
  { key: 'item', header: 'Item 品名规格', width: 34, kind: 'text' },
  { key: 'qty', header: 'Qty 数量', width: 10, kind: 'num' },
  { key: 'unit', header: 'Unit 单位', width: 8, kind: 'text' },
  { key: 'unitCost', header: 'Unit Cost 单价', width: 12, kind: 'usd' },
  { key: 'lineTotal', header: 'Line Total 小计', width: 14, kind: 'usd' },
  { key: 'currency', header: 'Currency 货币', width: 10, kind: 'text' },
  { key: 'notes', header: 'Notes 备注', width: 26, kind: 'text' },
];

/** A report row: text columns hold strings, num/usd columns hold number|null. */
export type PoReportRow = Record<string, string | number | null>;

/** Map a (PO, item) pair to a display report row — item is null for a PO with zero line items. */
export function toPoReportRow(
  po: PurchaseOrderRow,
  item: PoItemRow | null,
  statusLabel: string,
): PoReportRow {
  return {
    poNumber: po.poNumber,
    supplier: po.supplierName,
    orderDate: po.orderDate,
    status: statusLabel,
    item: item?.skuLabel ?? '',
    qty: item?.orderedQty ?? null,
    unit: item?.unit ?? '',
    unitCost: item?.unitCost ?? null,
    lineTotal: item?.lineTotal ?? null,
    currency: po.currency,
    notes: po.notes ?? '',
  };
}

/** Human-readable "filters applied" string for the report meta block. */
export function describePurchaseOrderFilters(f: {
  poNumber?: string;
  supplierName?: string;
  statusLabel?: string;
  from?: string;
  to?: string;
  familyName?: string;
}): string {
  const parts: string[] = [];
  if (f.poNumber) parts.push(`PO # ~ "${f.poNumber}"`);
  if (f.supplierName) parts.push(`Supplier: ${f.supplierName}`);
  if (f.statusLabel) parts.push(`Status: ${f.statusLabel}`);
  if (f.from || f.to) parts.push(`Date: ${f.from || '…'} — ${f.to || '…'}`);
  if (f.familyName) parts.push(`Item: ${f.familyName}`);
  return parts.length ? parts.join(' · ') : 'All purchase orders 全部采购订单';
}

export function formatUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function formatNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

/** Render a display cell for the HTML report according to its column kind. */
export function cellText(value: string | number | null, kind: PoReportColumnKind): string {
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

export interface PoReportData {
  generatedOn: string; // dd/mm/yyyy
  filtersSummary: string;
  rows: PoReportRow[];
  orderCount: number;
  /** One entry per currency present among the filtered orders — never blended together. */
  grandTotalByCurrency: Record<string, number>;
}

/**
 * A self-contained, print-optimized HTML document for the Purchase Orders
 * report — same layout family as buildInquiryReportHtml (letterhead, red
 * title bar, meta block, bordered table, right-aligned totals, red footer),
 * carrying its own "Print / Save as PDF" button rather than the caller
 * auto-triggering print() — the mobile-safe pattern fixed for Deposit
 * Invoice/Inquiries print earlier this session (a timer-fired print() from
 * the OPENER window is silently blocked by some mobile browsers).
 */
export function buildPurchaseOrderReportHtml(data: PoReportData): string {
  const metaRight: Array<[string, string]> = [
    ['Generated:', data.generatedOn],
    ['Orders:', String(data.orderCount)],
    ['Filters:', data.filtersSummary],
  ];

  const currencies = Object.keys(data.grandTotalByCurrency);
  const totals: Array<[string, string, boolean]> = [
    ['Order lines 明细行数:', String(data.rows.length), false],
    ...currencies.map((cur, i): [string, string, boolean] => [
      `Total (${cur}) 总额:`,
      formatUsd(data.grandTotalByCurrency[cur]),
      i === currencies.length - 1,
    ]),
  ];

  const thead = PO_REPORT_COLUMNS.map(
    (c) => `<th class="${c.kind === 'text' ? 'l' : 'r'}">${esc(c.header)}</th>`,
  ).join('');

  const tbody =
    data.rows.length === 0
      ? `<tr><td class="empty" colspan="${PO_REPORT_COLUMNS.length}">No records for this report 暂无记录</td></tr>`
      : data.rows
          .map(
            (row) =>
              `<tr>${PO_REPORT_COLUMNS.map((c) => {
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
<title>ZY Steel · Purchase Orders Report</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
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
  .meta-r .mv { text-align: right; max-width: 260px; }
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
  .toolbar {
    position: fixed; top: 14px; right: 14px; z-index: 100;
    display: flex; align-items: center; gap: 10px;
    background: #fff; border: 1px solid #d8d8d8; border-radius: 8px;
    padding: 8px 12px; box-shadow: 0 2px 10px rgba(0,0,0,.15);
    font-family: Arial, sans-serif;
  }
  .toolbar button {
    background: ${RED}; color: #fff; border: none; border-radius: 6px;
    padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
  }
  .toolbar button:hover { opacity: .9; }
  .toolbar .hint { font-size: 10px; color: ${MUTED}; }
  @page { size: A4 landscape; margin: 10mm; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
    <span class="hint">Reviewing only — nothing has been printed yet.</span>
  </div>
  <div class="letterhead">
    <img src="/brand/zysteel-logo.png" alt="ZY Steel 中粤铁网" class="logo" />
    <div>
      <div class="brand">ZY STEEL</div>
      <div class="brand-zh">中粤铁网</div>
      <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer</div>
      <div class="sub">Phnom Penh, Kingdom of Cambodia</div>
    </div>
  </div>

  <div class="bar">PURCHASE ORDERS REPORT · 采购订单报表</div>

  <div class="meta">
    <div class="meta-l">
      <div class="lbl">REPORT:</div>
      <div class="val">Purchase Orders (filtered) 采购订单（已筛选）</div>
      <div class="small">Prices in each order's own currency 价格按各订单货币显示</div>
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
      <li>Line Total = Ordered Qty × Unit Cost. 小计 = 订购数量 × 单价。</li>
      <li>Totals are summed separately per currency, never blended together. 总额按货币分别汇总，不合并计算。</li>
      <li>Confidential — internal purchasing report. 机密，内部采购报告。</li>
    </ol>
  </div>

  <div class="footer">ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business</div>
</body>
</html>`;
}
