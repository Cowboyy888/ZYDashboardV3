/**
 * Price Record / Price History — pure, no I/O.
 *
 * The historical price ledger: every price a product/customer combination has
 * ever had, never overwritten. Creating a new active price for the same
 * (sku, customer, price type) context auto-expires the previous one instead
 * (see actions/price-records.ts) — this file only contains the read-side
 * logic: given a set of records, which one actually applies right now.
 */

export const PRICE_STATUSES = ['active', 'expired', 'cancelled'] as const;
export type PriceStatus = (typeof PRICE_STATUSES)[number];

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Priority order a price record is picked in when several could apply to the
 * same product — customer-specific pricing always wins over generic pricing.
 * Matches the toolkit spec exactly: customer -> project -> special ->
 * wholesale -> promotional -> standard. Keyed by price TYPE NAME (the
 * price_types.name seed values), not an id, since the type list is editable.
 */
export const PRICE_TYPE_PRIORITY = [
  'Customer Price',
  'Project Price',
  'Special Price',
  'Wholesale Price',
  'Promotional Price',
  'Standard Price',
] as const;

export interface PriceRecordLike {
  id: string;
  skuId: string;
  customerId: string | null;
  priceTypeName: string;
  price: number;
  effectiveDate: string; // ISO YYYY-MM-DD
  expiryDate: string | null;
  status: PriceStatus;
}

/**
 * DB rows carry `price_type_id`, not the name `resolveCurrentPrice` ranks by
 * (the type list is editable, see price_types) — this joins the two shapes.
 * `priceTypeName` falls back to '' (ranks last, same as any unrecognized
 * name) when the id can't be resolved, e.g. a stale/deleted lookup row.
 */
export function toPriceRecordLike(
  row: {
    id: string;
    sku_id: string;
    customer_id: string | null;
    price_type_id: string;
    price: number;
    effective_date: string;
    expiry_date: string | null;
    status: PriceStatus;
  },
  priceTypeNameById: Map<string, string>,
): PriceRecordLike {
  return {
    id: row.id,
    skuId: row.sku_id,
    customerId: row.customer_id,
    priceTypeName: priceTypeNameById.get(row.price_type_id) ?? '',
    price: row.price,
    effectiveDate: row.effective_date,
    expiryDate: row.expiry_date,
    status: row.status,
  };
}

/** True once a record's expiry date has passed as of `today`. */
export function isExpired(record: Pick<PriceRecordLike, 'expiryDate'>, today: string): boolean {
  return record.expiryDate != null && record.expiryDate < today;
}

/** True once a record's effective date has arrived as of `today` (not a future price). */
export function isEffective(
  record: Pick<PriceRecordLike, 'effectiveDate'>,
  today: string,
): boolean {
  return record.effectiveDate <= today;
}

/** Days remaining until expiry (negative once past). Null when the record never expires. */
export function daysUntilExpiry(
  record: Pick<PriceRecordLike, 'expiryDate'>,
  today: string,
): number | null {
  if (record.expiryDate == null) return null;
  const ms = Date.parse(record.expiryDate) - Date.parse(today);
  return Math.round(ms / 86_400_000);
}

/**
 * Which price actually applies right now for a given sku (+ optional
 * customer), as of `asOfDate`. Only considers records that are `active`,
 * already effective, and not yet expired — then picks the highest-priority
 * price type among those, preferring an exact customer match over a
 * customer-less (standard/wholesale/promotional) one.
 *
 * Returns null when nothing applies (spec's "Products with no current
 * price" alert condition).
 */
export function resolveCurrentPrice(
  records: PriceRecordLike[],
  { skuId, customerId, asOfDate }: { skuId: string; customerId: string | null; asOfDate: string },
): PriceRecordLike | null {
  const candidates = records.filter(
    (r) =>
      r.skuId === skuId &&
      r.status === 'active' &&
      isEffective(r, asOfDate) &&
      !isExpired(r, asOfDate) &&
      (r.customerId === null || r.customerId === customerId),
  );
  if (candidates.length === 0) return null;

  const rank = (r: PriceRecordLike): number => {
    const typeRank = PRICE_TYPE_PRIORITY.indexOf(
      r.priceTypeName as (typeof PRICE_TYPE_PRIORITY)[number],
    );
    // A record scoped to THIS customer always outranks a customer-less one of
    // the same price type (e.g. two "Special Price" rows, one customer-
    // specific, one general) — encoded as a coarser primary sort key.
    const customerRank = r.customerId === customerId && customerId != null ? 0 : 1;
    return customerRank * 100 + (typeRank === -1 ? PRICE_TYPE_PRIORITY.length : typeRank);
  };

  return [...candidates].sort((a, b) => rank(a) - rank(b))[0]!;
}
