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
