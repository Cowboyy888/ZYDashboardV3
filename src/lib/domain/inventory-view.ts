/**
 * Pure assembly of inventory display rows from master data + ledger balances.
 * Reused by the Inventory page and the Telegram inventory report so both show
 * identical numbers. No I/O.
 */
import {
  buildSkuLabel,
  isLowStock,
  leadingSpecNumber,
  familyDisplayRank,
  type ConditionCode,
} from './products';
import { round3 } from './stock-ledger';

export interface SkuLike {
  id: string;
  family_id: string;
  diameter: string | null;
  size: string | null;
  hole: string | null;
  rod_count: string | null;
  extra: string | null;
  condition: ConditionCode;
  unit: string;
  minimum_level: number;
}

export interface FamilyLike {
  id: string;
  name: string;
}

export interface LocationLike {
  id: string;
  code: string;
  name: string;
}

export interface BalanceLike {
  sku_id: string;
  location_id: string;
  quantity: number;
}

export interface InventoryDisplayRow {
  skuId: string;
  familyId: string;
  familyName: string;
  label: string;
  condition: ConditionCode;
  unit: string;
  minimumLevel: number;
  storageRoom: number;
  warehouse: number;
  other: number;
  total: number;
  isLow: boolean;
}

export interface FamilyUnitTotal {
  familyId: string;
  familyName: string;
  unit: string;
  total: number;
}

/**
 * Totals grouped by (product family, unit). Quantities in different units
 * (张 / 捆 / 吨 / kg …) are NEVER added together — each family+unit is its own
 * line. There is deliberately no single mixed-unit "grand total".
 */
export function totalsByFamilyUnit(rows: InventoryDisplayRow[]): FamilyUnitTotal[] {
  const map = new Map<string, FamilyUnitTotal>();
  for (const r of rows) {
    const key = `${r.familyId}||${r.unit}`;
    const existing = map.get(key);
    if (existing) {
      existing.total = round3(existing.total + r.total);
    } else {
      map.set(key, {
        familyId: r.familyId,
        familyName: r.familyName,
        unit: r.unit,
        total: round3(r.total),
      });
    }
  }
  return [...map.values()].sort(
    (a, b) => a.familyName.localeCompare(b.familyName) || a.unit.localeCompare(b.unit),
  );
}

export function buildInventoryRows(
  skus: SkuLike[],
  families: FamilyLike[],
  locations: LocationLike[],
  balances: BalanceLike[],
  locale: 'en' | 'zh' = 'zh',
): InventoryDisplayRow[] {
  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const storageId = locations.find((l) => l.code === 'storage_room')?.id;
  const warehouseId = locations.find((l) => l.code === 'warehouse')?.id;

  // Index balances by sku -> location -> qty.
  const bySku = new Map<string, Map<string, number>>();
  for (const b of balances) {
    if (!bySku.has(b.sku_id)) bySku.set(b.sku_id, new Map());
    bySku.get(b.sku_id)!.set(b.location_id, Number(b.quantity));
  }

  // Group by family, then diameter descending (high to low) within each —
  // same ordering the Telegram inventory report uses, via the shared
  // `leadingSpecNumber` helper, so both stay consistent.
  const ordered = [...skus].sort((a, b) => {
    const famA = familyName.get(a.family_id) ?? '—';
    const famB = familyName.get(b.family_id) ?? '—';
    return (
      familyDisplayRank(famA) - familyDisplayRank(famB) ||
      leadingSpecNumber(b.diameter) - leadingSpecNumber(a.diameter)
    );
  });

  return ordered.map((sku) => {
    const locBal = bySku.get(sku.id) ?? new Map<string, number>();
    let total = 0;
    for (const q of locBal.values()) total += q;
    const storageRoom = storageId ? (locBal.get(storageId) ?? 0) : 0;
    const warehouse = warehouseId ? (locBal.get(warehouseId) ?? 0) : 0;
    const other = round3(total - storageRoom - warehouse);
    const fam = familyName.get(sku.family_id) ?? '—';
    return {
      skuId: sku.id,
      familyId: sku.family_id,
      familyName: fam,
      label: buildSkuLabel(
        {
          familyName: fam,
          diameter: sku.diameter,
          size: sku.size,
          hole: sku.hole,
          rodCount: sku.rod_count,
          extra: sku.extra,
          condition: sku.condition,
          unit: sku.unit,
        },
        locale,
      ),
      condition: sku.condition,
      unit: sku.unit,
      minimumLevel: sku.minimum_level,
      storageRoom: round3(storageRoom),
      warehouse: round3(warehouse),
      other,
      total: round3(total),
      isLow: isLowStock(round3(total), sku.minimum_level),
    };
  });
}
