/**
 * Branded Inventory Report — Standard vs Special specification, pure HTML
 * builder, no DOM / no server deps. Shared by BOTH exports so they stay
 * identical: the server .xlsx builder (inventory-report-xlsx.ts) and the
 * server-rendered PDF (see /api/export/inventory/pdf).
 *
 * Standard = size "3×6" or "2.4×6" (computed by `classifySpecification`,
 * never a stored category); every other SKU is Special. The two are always
 * rendered as separate, clearly labelled sections — Standard first.
 */
import {
  totalsBySpecTypeUnit,
  type InventoryReportRow,
  type SpecTypeUnitTotal,
} from '@/lib/domain/inventory-view';
import { round3 } from '@/lib/domain/stock-ledger';
import { KHMER_FONT_FACE_CSS } from './fonts/noto-sans-khmer';

export interface InventoryReportColumn {
  key: string;
  header: string; // bilingual "English 中文"
  width: number; // Excel column width
  kind: 'text' | 'num';
  /** Only shown in the Special section (Standard SKUs have no status/customer of interest). */
  specialOnly?: boolean;
}

/** Single source of truth for report columns — Excel + HTML both iterate this. */
export const INVENTORY_REPORT_COLUMNS: InventoryReportColumn[] = [
  { key: 'product', header: 'Product 产品', width: 20, kind: 'text' },
  { key: 'diameter', header: 'Diameter 直径', width: 11, kind: 'text' },
  { key: 'size', header: 'Size 尺寸', width: 11, kind: 'text' },
  { key: 'hole', header: 'Mesh Opening 网孔', width: 12, kind: 'text' },
  { key: 'type', header: 'Type 规格类型', width: 11, kind: 'text' },
  { key: 'quantity', header: 'Quantity 数量', width: 11, kind: 'num' },
  { key: 'reserved', header: 'Reserved 预留', width: 11, kind: 'num' },
  { key: 'available', header: 'Available 可用', width: 11, kind: 'num' },
  { key: 'unit', header: 'Unit 单位', width: 9, kind: 'text' },
  { key: 'status', header: 'Status 状态', width: 9, kind: 'text', specialOnly: true },
  {
    key: 'customer',
    header: 'Customer/Project 客户/项目',
    width: 20,
    kind: 'text',
    specialOnly: true,
  },
  { key: 'remarks', header: 'Remarks 备注', width: 20, kind: 'text' },
];

export function columnsForSection(section: 'standard' | 'special'): InventoryReportColumn[] {
  return INVENTORY_REPORT_COLUMNS.filter((c) => section === 'special' || !c.specialOnly);
}

export function reportCellValue(row: InventoryReportRow, key: string): string | number {
  switch (key) {
    case 'product':
      return row.familyName;
    case 'diameter':
      return row.diameter ?? '';
    case 'size':
      return row.size ?? '';
    case 'hole':
      return row.hole ?? '';
    case 'type':
      return row.specType === 'standard' ? 'Standard' : 'Special';
    case 'quantity':
      return row.total;
    case 'reserved':
      return row.reserved;
    case 'available':
      return row.available;
    case 'unit':
      return row.unit;
    case 'status':
      return row.isLow ? 'Low' : 'OK';
    case 'customer':
      return row.customerProject;
    case 'remarks':
      return row.notes ?? '';
    default:
      return '';
  }
}

export function formatNum(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  return Number(v).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function cellText(value: string | number, kind: 'text' | 'num'): string {
  if (kind === 'num') return formatNum(value as number);
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

export interface InventoryReportData {
  generatedOn: string; // dd/mm/yyyy
  rows: InventoryReportRow[]; // both Standard and Special, unfiltered
}

/** Sum reserved/available totals across specification types, grouped by unit only. */
export function combinedUnitTotals(unitTotals: SpecTypeUnitTotal[]): {
  reservedByUnit: Array<{ unit: string; value: number }>;
  availableByUnit: Array<{ unit: string; value: number }>;
} {
  const reserved = new Map<string, number>();
  const available = new Map<string, number>();
  for (const u of unitTotals) {
    reserved.set(u.unit, round3((reserved.get(u.unit) ?? 0) + u.reservedTotal));
    available.set(u.unit, round3((available.get(u.unit) ?? 0) + u.availableTotal));
  }
  return {
    reservedByUnit: [...reserved.entries()].map(([unit, value]) => ({ unit, value })),
    availableByUnit: [...available.entries()].map(([unit, value]) => ({ unit, value })),
  };
}

const RED = '#e31e24';
const BANNER = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

function unitChips(totals: Array<{ unit: string; value: number }>): string {
  if (totals.length === 0) return '—';
  return totals.map((u) => `${formatNum(u.value)} ${esc(u.unit)}`).join(' &nbsp;·&nbsp; ');
}

function sectionTable(
  label: string,
  rows: InventoryReportRow[],
  section: 'standard' | 'special',
): string {
  const columns = columnsForSection(section);
  const thead = columns
    .map((c) => `<th class="${c.kind === 'text' ? 'l' : 'r'}">${esc(c.header)}</th>`)
    .join('');
  const tbody =
    rows.length === 0
      ? `<tr><td class="empty" colspan="${columns.length}">No records for this section 暂无记录</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr>${columns
                .map((c) => {
                  const align = c.kind === 'text' ? 'l' : 'r';
                  return `<td class="${align}">${esc(cellText(reportCellValue(row, c.key), c.kind))}</td>`;
                })
                .join('')}</tr>`,
          )
          .join('');
  return `
  <div class="bar2">${esc(label)}</div>
  <table class="data">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>`;
}

/**
 * A self-contained, print-optimized HTML document for the Inventory Report —
 * Standard specification first, Special specification second, each in its
 * own clearly labelled section with its own per-unit stock total; overall
 * Reserved/Available totals follow. Rendered to a real PDF server-side by
 * pdf.ts (see /api/export/inventory/pdf).
 */
export function buildInventoryReportHtml(data: InventoryReportData): string {
  const standardRows = data.rows.filter((r) => r.specType === 'standard');
  const specialRows = data.rows.filter((r) => r.specType === 'special');
  const unitTotals = totalsBySpecTypeUnit(data.rows);
  const standardTotals = unitTotals
    .filter((u) => u.specType === 'standard')
    .map((u) => ({ unit: u.unit, value: u.stockTotal }));
  const specialTotals = unitTotals
    .filter((u) => u.specType === 'special')
    .map((u) => ({ unit: u.unit, value: u.stockTotal }));
  const { reservedByUnit, availableByUnit } = combinedUnitTotals(unitTotals);
  const lowCount = data.rows.filter((r) => r.isLow).length;

  const metaRight: Array<[string, string]> = [
    ['Generated:', data.generatedOn],
    ['Specifications:', String(data.rows.length)],
    ['Low stock:', String(lowCount)],
  ];
  const metaRightHtml = metaRight
    .map(([l, v]) => `<tr><td class="ml">${esc(l)}</td><td class="mv">${esc(v)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · Inventory Report</title>
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
  .bar2 {
    background: ${BANNER}; color: ${RED}; font-weight: 700; text-align: left;
    padding: 6px 8px; margin: 16px 0 6px; font-size: 11px; letter-spacing: .3px;
    border-left: 4px solid ${RED};
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
  .section-totals { font-size: 9px; margin: 4px 0 0; text-align: right; color: ${INK}; }
  .section-totals b { color: ${RED}; }
  .totals { margin-top: 14px; display: flex; justify-content: flex-end; }
  .totals table { border-collapse: collapse; font-size: 10px; }
  .totals .tl { text-align: right; font-weight: 700; padding: 3px 10px; }
  .totals .tv { text-align: right; font-weight: 700; padding: 3px 10px; border: 1px solid #bfbfbf; min-width: 140px; }
  .totals tr.hi .tl, .totals tr.hi .tv { background: ${BANNER}; color: ${RED}; }
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

  <div class="bar">INVENTORY REPORT · 库存报表</div>

  <div class="meta">
    <div class="meta-l">
      <div class="lbl">REPORT:</div>
      <div class="val">Standard vs Special Specification 标准与特殊规格</div>
      <div class="small">Standard = 3×6 m / 2.4×6 m 标准 = 3×6米 / 2.4×6米</div>
    </div>
    <table class="meta-r">${metaRightHtml}</table>
  </div>

  ${sectionTable('STANDARD SPECIFICATION · 标准规格 (3×6m | 2.4×6m)', standardRows, 'standard')}
  <div class="section-totals">Standard total 标准合计: <b>${unitChips(standardTotals)}</b></div>

  ${sectionTable('SPECIAL SPECIFICATION · 特殊规格 (All other sizes 其他所有尺寸)', specialRows, 'special')}
  <div class="section-totals">Special total 特殊合计: <b>${unitChips(specialTotals)}</b></div>

  <div class="totals">
    <table>
      <tr><td class="tl">Total Reserved 预留合计:</td><td class="tv">${unitChips(reservedByUnit)}</td></tr>
      <tr class="hi"><td class="tl">Total Available 可用合计:</td><td class="tv">${unitChips(availableByUnit)}</td></tr>
    </table>
  </div>

  <div class="notes">
    <h4>NOTES · 说明</h4>
    <ol>
      <li>Specification type is calculated automatically from Size — never manually entered. 规格类型根据尺寸自动计算，非手动录入。</li>
      <li>Reserved = outstanding quantity on confirmed sales orders not yet delivered. 预留 = 已确认但尚未发货的销售订单数量。</li>
      <li>Available = physical stock − reserved. 可用 = 实际库存 − 预留。</li>
      <li>Confidential — internal inventory report. 机密，内部库存报告。</li>
    </ol>
  </div>

  <div class="footer">ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business</div>
</body>
</html>`;
}
