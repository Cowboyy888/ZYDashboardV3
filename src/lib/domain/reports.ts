/**
 * Pure text builder for the Telegram inventory report. Kept free of I/O so the
 * exact message body can be unit-tested and reused by both the "Send now" action
 * and the scheduled cron jobs.
 *
 * The attendance report lives in ./attendance-report.ts (grouped format).
 */

import { formatDDMMYYYY } from './datetime';
import {
  CONDITION_LABELS,
  leadingSpecNumber,
  familyDisplayRank,
  type ConditionCode,
} from './products';

export interface InventoryReportRow {
  skuLabel: string;
  familyName: string;
  condition: ConditionCode;
  unit: string;
  storageRoom: number;
  warehouse: number;
  total: number;
  minimumLevel: number | null;
  isLow: boolean;
  /** Raw spec attributes (see SkuAttributes in ./products) — used to lay out
   * the plain-language stock list the way the factory floor actually reads it. */
  diameter: string | null;
  size: string | null;
  hole: string | null;
  rodCount: string | null;
  extra: string | null;
}

export interface InventoryReportOptions {
  businessDate: string;
  includeLowStockSection?: boolean;
}

function fmtQty(n: number): string {
  // Show up to 3 decimals but trim trailing zeros (e.g. 30.5, 10, 902).
  return Number(n.toFixed(3)).toString();
}

// Section headings match how the factory floor actually refers to each
// family in daily stock-taking notes (网片/盘圆), not the formal family name.
// Any family not listed here just uses its own name; section ORDER comes
// from the shared `familyDisplayRank` (see ./products).
const FAMILY_HEADING: Record<string, string> = {
  钢筋网: '网片',
  螺纹盘圆: '盘圆',
};

function familyHeading(name: string): string {
  return FAMILY_HEADING[name] ?? name;
}

/** Condition (if not normal) and any free-form extra spec, e.g. " (旧)" or " (错毛边)". */
function annotation(r: InventoryReportRow): string {
  const parts: string[] = [];
  if (r.condition !== 'normal') parts.push(CONDITION_LABELS[r.condition].zh);
  if (r.extra) parts.push(r.extra);
  return parts.length ? ` (${parts.join('、')})` : '';
}

/** Mesh-style spec line, e.g. "5.5厘 3×6 20孔 (15根) = 1173张 (错毛边)". */
function meshLine(r: InventoryReportRow): string {
  const rod = r.rodCount ? ` (${r.rodCount})` : '';
  return `${r.diameter ?? ''} ${r.size ?? ''} ${r.hole ?? ''}${rod} = ${fmtQty(r.total)}${r.unit}${annotation(r)}`;
}

/** Coil/bundle-style spec line (no size/hole), e.g. "10厘 剩余 10捆". */
function coilLine(r: InventoryReportRow): string {
  return `${r.diameter ?? ''} 剩余 ${fmtQty(r.total)}${r.unit}${annotation(r)}`;
}

/**
 * Build the daily inventory report: a plain-language stock list grouped by
 * family (网片 first, then 盘圆, then 拔丝料, each sorted by diameter
 * descending), followed by the low-stock warning section.
 */
export function renderInventoryReport(
  rows: InventoryReportRow[],
  options: InventoryReportOptions,
): string {
  const lines: string[] = [];
  const dateStr = formatDDMMYYYY(options.businessDate);

  const byFamily = new Map<string, InventoryReportRow[]>();
  for (const r of rows) {
    if (!byFamily.has(r.familyName)) byFamily.set(r.familyName, []);
    byFamily.get(r.familyName)!.push(r);
  }
  const familyNames = [...byFamily.keys()].sort(
    (a, b) => familyDisplayRank(a) - familyDisplayRank(b),
  );

  familyNames.forEach((name, i) => {
    const heading = familyHeading(name);
    lines.push(i === 0 ? `${dateStr} ${heading}库存` : heading);
    lines.push('');
    const items = [...byFamily.get(name)!].sort(
      (a, b) => leadingSpecNumber(b.diameter) - leadingSpecNumber(a.diameter),
    );
    for (const r of items) {
      lines.push(r.size || r.hole ? meshLine(r) : coilLine(r));
    }
    lines.push('');
  });

  if (options.includeLowStockSection !== false) {
    const low = rows.filter((r) => r.isLow);
    if (low.length > 0) {
      lines.push('⚠️ 低库存 / Low stock:');
      for (const r of low) {
        lines.push(`• ${r.skuLabel} — ${fmtQty(r.total)}/${fmtQty(r.minimumLevel ?? 0)} ${r.unit}`);
      }
    } else {
      lines.push('低库存 / Low stock: 无 / none ✅');
    }
  }

  return lines.join('\n').trimEnd();
}
