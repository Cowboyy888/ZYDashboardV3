/**
 * Product / SKU domain helpers.
 *
 * Product families and specifications are EDITABLE master data (stored in the
 * DB), never hard-coded. This module only provides the pure logic for:
 *   - the fixed set of stock conditions, and
 *   - building a canonical, unique label + signature for a SKU from its
 *     attributes (family, diameter, size, hole spec, optional rod count,
 *     condition, unit).
 *
 * For 钢筋网 every unique attribute combination is a separate SKU. For 拔丝料 /
 * 螺纹盘圆 the same structure is used with fewer attributes filled in.
 */

export const CONDITIONS = ['normal', 'old', 'rough_edge', 'damaged'] as const;
export type ConditionCode = (typeof CONDITIONS)[number];

export const CONDITION_LABELS: Record<ConditionCode, { en: string; zh: string }> = {
  normal: { en: 'Normal', zh: '正常' },
  old: { en: 'Old', zh: '旧' },
  rough_edge: { en: 'Rough edge', zh: '错毛边' },
  damaged: { en: 'Damaged', zh: '损坏' },
};

export function isCondition(value: unknown): value is ConditionCode {
  return typeof value === 'string' && (CONDITIONS as readonly string[]).includes(value);
}

export interface SkuAttributes {
  /** Family display name, e.g. 钢筋网, 拔丝料, 螺纹盘圆. */
  familyName: string;
  /** e.g. "9厘", "5.5厘", "10厘". */
  diameter?: string | null;
  /** e.g. "3×6", "2.4×6". */
  size?: string | null;
  /** e.g. "20孔", "15孔". */
  hole?: string | null;
  /** Optional rod count, e.g. "15根". */
  rodCount?: string | null;
  /** Free-form extra spec (used mainly by the configurable 螺纹盘圆 family). */
  extra?: string | null;
  condition: ConditionCode;
  /** Unit of measure, e.g. "张", "捆". */
  unit: string;
}

function clean(value?: string | null): string | null {
  const v = (value ?? '').trim();
  return v.length ? v : null;
}

/**
 * Human-readable label, e.g.
 *   "钢筋网 · 5.5厘 | 3×6 | 20孔 | 15根 | Normal (张)"
 * Condition renders in the requested locale; attributes stay verbatim (they are
 * Chinese domain terms used the same way in both languages).
 */
export function buildSkuLabel(attr: SkuAttributes, locale: 'en' | 'zh' = 'zh'): string {
  const parts = [
    clean(attr.diameter),
    clean(attr.size),
    clean(attr.hole),
    clean(attr.rodCount),
    clean(attr.extra),
    CONDITION_LABELS[attr.condition][locale],
  ].filter((p): p is string => p !== null);
  const spec = parts.join(' | ');
  return `${attr.familyName} · ${spec} (${attr.unit})`;
}

/**
 * Canonical signature used to enforce SKU uniqueness. Case/space-insensitive on
 * free-form fields; condition + unit included so e.g. Normal vs 旧 are distinct.
 */
export function skuSignature(attr: SkuAttributes): string {
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, '');
  return [
    norm(attr.familyName),
    norm(attr.diameter),
    norm(attr.size),
    norm(attr.hole),
    norm(attr.rodCount),
    norm(attr.extra),
    attr.condition,
    norm(attr.unit),
  ].join('|');
}

/** True when two attribute sets describe the same SKU. */
export function isSameSku(a: SkuAttributes, b: SkuAttributes): boolean {
  return skuSignature(a) === skuSignature(b);
}

/** Whether a live balance is at or below the SKU's minimum-stock level. */
export function isLowStock(balance: number, minimumLevel: number | null | undefined): boolean {
  if (minimumLevel == null || minimumLevel <= 0) return false;
  return balance <= minimumLevel;
}

/**
 * Leading numeric value of a free-text spec like "7.8厘", "9", or "6.5mm" — used
 * to sort specs by diameter (high to low) wherever they're listed: the
 * Inventory page's stock table and the Telegram inventory report both use
 * this, so the ordering stays identical between them.
 */
export function leadingSpecNumber(value: string | null): number {
  if (!value) return -Infinity;
  const m = value.match(/^-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : -Infinity;
}

export type SpecificationType = 'standard' | 'special';

/** The two bulk sheet sizes 钢筋网 ships as standard stock — everything else is Special. */
const STANDARD_SIZES = ['3×6', '2.4×6'];

function normalizeSizeForClassification(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/x/g, '×')
    .replace(/\s+/g, '')
    .replace(/m$/, '')
    .replace(/米$/, '');
}

const NORMALIZED_STANDARD_SIZES = new Set(STANDARD_SIZES.map(normalizeSizeForClassification));

/**
 * Standard vs Special specification, computed from the SKU's `size` field —
 * never a manually entered/stored category, so it can't drift out of sync
 * with the size itself. Only "3×6" and "2.4×6" are Standard; every other
 * size (customer-customised dimensions, project specs, or no size at all —
 * e.g. 拔丝料/螺纹盘圆 SKUs) is Special. Normalization is tolerant of
 * "x"/"×"/"X" variants, stray whitespace, and a trailing "m"/"米" unit
 * suffix, since `size` is free-text and has been entered inconsistently.
 * Drives the Inventory Report's Standard/Special split.
 */
export function classifySpecification(size: string | null | undefined): SpecificationType {
  const normalized = normalizeSizeForClassification(size);
  return normalized.length > 0 && NORMALIZED_STANDARD_SIZES.has(normalized)
    ? 'standard'
    : 'special';
}

/**
 * Display order for product families — 钢筋网 (mesh) first, then 螺纹盘圆
 * (coil), then 拔丝料 (wire); any other family sorts after these, in
 * whatever order it appears. Deliberately NOT locale string comparison
 * (Chinese collation order doesn't track this business convention). Shared
 * by the Inventory page's stock table and the Telegram inventory report.
 */
export const FAMILY_DISPLAY_ORDER = ['钢筋网', '螺纹盘圆', '拔丝料'];

export function familyDisplayRank(name: string): number {
  const i = FAMILY_DISPLAY_ORDER.indexOf(name);
  return i === -1 ? FAMILY_DISPLAY_ORDER.length : i;
}

// --- Product family deletion safety ------------------------------------------

/**
 * How many historical records reference a product family. A permanent Delete is
 * only safe when EVERY count is zero; otherwise the family must be Archived so
 * the history stays intact (and auditable). purchase/sales are Phase 2 and are
 * reported here so the check is complete once those modules land.
 */
export interface FamilyUsage {
  specs: number; // specifications (SKUs) in the family
  movements: number; // stock movements referencing any of its SKUs
  production: number; // production_output movements (subset of movements)
  purchases: number; // purchase-order lines (Phase 2)
  sales: number; // sales-order lines (Phase 2)
}

export const EMPTY_FAMILY_USAGE: FamilyUsage = {
  specs: 0,
  movements: 0,
  production: 0,
  purchases: 0,
  sales: 0,
};

/** True if a family has ANY history and therefore must not be hard-deleted. */
export function familyHasHistory(u: FamilyUsage): boolean {
  return u.specs > 0 || u.movements > 0 || u.production > 0 || u.purchases > 0 || u.sales > 0;
}

/** A family may be permanently deleted only when it has no history at all. */
export function canDeleteFamily(u: FamilyUsage): boolean {
  return !familyHasHistory(u);
}

/**
 * Machine-readable reasons a delete was blocked (each maps to a localised label
 * in the UI). Empty array => deletion is allowed.
 */
export function familyDeleteBlockers(u: FamilyUsage): Array<keyof FamilyUsage> {
  return (Object.keys(EMPTY_FAMILY_USAGE) as Array<keyof FamilyUsage>).filter((k) => u[k] > 0);
}

/**
 * Families offered in NEW inventory / purchase / production / sales / spec forms.
 * Archived families are excluded (they remain visible in historical records).
 * Reactivating a family (is_active = true) makes it selectable again.
 */
export function selectableFamilies<T extends { is_active: boolean }>(families: T[]): T[] {
  return families.filter((f) => f.is_active);
}
