/**
 * Competitor price intelligence — pure, no-I/O (toolkit sheet 12).
 *
 * "Never record a price without its specification — a price alone is
 * meaningless." Everything here therefore compares LIKE FOR LIKE: prices are
 * only ever compared within the same normalised specification, and only after
 * being put on the same delivery basis.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export type PriceBasis = 'ex_works' | 'delivered';
export type CompetitorKind = 'factory' | 'trader' | 'unknown';

export const PRICE_BASIS_LABELS: Record<PriceBasis, { en: string; zh: string }> = {
  ex_works: { en: 'Ex-works', zh: '出厂价' },
  delivered: { en: 'Delivered', zh: '送货价' },
};

/**
 * Normalise a specification for comparison: case- and space-insensitive, with
 * common separators unified, so "6mm · 200x200 · 5.0x2.0m" and
 * "6MM 200*200 5.0*2.0M" are recognised as the same product.
 */
export function normalizeSpec(spec: string): string {
  return spec
    .toLowerCase()
    .replace(/[×✕]/g, 'x')
    .replace(/[*]/g, 'x')
    .replace(/[·•,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Two observations describe the same product when their specs normalise equal. */
export function isSameSpec(a: string, b: string): boolean {
  return normalizeSpec(a) === normalizeSpec(b);
}

/**
 * Put a price on a common basis. An ex-works price plus delivery is comparable
 * with a delivered price; without a delivery cost the two simply are not
 * comparable, so this returns null rather than pretending.
 */
export function toDeliveredPrice(
  price: number | null,
  basis: PriceBasis,
  deliveryCost: number | null,
): number | null {
  const p = num(price);
  if (basis === 'delivered') return round2(p);
  if (deliveryCost == null) return null;
  return round2(p + num(deliveryCost));
}

/**
 * Our price minus theirs, as a share of their price. Positive means we are
 * more expensive — the number the salesperson has to justify.
 */
export function priceGapPct(ourPrice: number | null, theirPrice: number | null): number | null {
  const theirs = num(theirPrice);
  if (theirs <= 0) return null;
  return (num(ourPrice) - theirs) / theirs;
}

export interface CompetitorObservation {
  competitor: string;
  specification: string;
  price: number | null;
  unit: string;
  basis: PriceBasis;
  observedOn: string;
  dealsWonVs?: number | null;
  dealsLostTo?: number | null;
}

/**
 * The most recent observation per competitor for a given spec. Old prices are
 * worse than no price, so comparison always uses the latest sighting.
 */
export function latestBySpec(
  observations: CompetitorObservation[],
  specification: string,
): CompetitorObservation[] {
  const target = normalizeSpec(specification);
  const latest = new Map<string, CompetitorObservation>();
  for (const o of observations) {
    if (normalizeSpec(o.specification) !== target) continue;
    const existing = latest.get(o.competitor);
    if (!existing || o.observedOn > existing.observedOn) latest.set(o.competitor, o);
  }
  return [...latest.values()].sort((a, b) => num(a.price) - num(b.price));
}

export interface PriceComparison {
  competitor: string;
  theirPrice: number;
  gapPct: number | null;
  observedOn: string;
  /** True when we are the cheaper of the two. */
  weAreCheaper: boolean;
}

/**
 * Compare our price for one specification against every competitor's most
 * recent observation of the SAME specification.
 */
export function compareToMarket(
  ourPrice: number | null,
  specification: string,
  observations: CompetitorObservation[],
): { comparisons: PriceComparison[]; cheapestCompetitor: string | null; weAreCheapest: boolean } {
  const latest = latestBySpec(observations, specification);
  const comparisons = latest.map((o) => ({
    competitor: o.competitor,
    theirPrice: round2(num(o.price)),
    gapPct: priceGapPct(ourPrice, o.price),
    observedOn: o.observedOn,
    weAreCheaper: num(ourPrice) < num(o.price),
  }));
  const cheapest = comparisons.length > 0 ? comparisons[0]! : null;
  return {
    comparisons,
    cheapestCompetitor: cheapest?.competitor ?? null,
    weAreCheapest: cheapest ? num(ourPrice) < cheapest.theirPrice : true,
  };
}

export interface CompetitorRecord {
  competitor: string;
  observations: number;
  won: number;
  lost: number;
  /** won / (won + lost); 0 when nothing has been decided against them. */
  winRate: number;
  lastObserved: string | null;
}

/** Head-to-head record against each competitor. */
export function competitorRecords(observations: CompetitorObservation[]): CompetitorRecord[] {
  const map = new Map<string, CompetitorRecord>();
  for (const o of observations) {
    const r = map.get(o.competitor) ?? {
      competitor: o.competitor,
      observations: 0,
      won: 0,
      lost: 0,
      winRate: 0,
      lastObserved: null,
    };
    r.observations += 1;
    r.won += num(o.dealsWonVs);
    r.lost += num(o.dealsLostTo);
    if (!r.lastObserved || o.observedOn > r.lastObserved) r.lastObserved = o.observedOn;
    map.set(o.competitor, r);
  }
  for (const r of map.values()) {
    const decided = r.won + r.lost;
    r.winRate = decided > 0 ? r.won / decided : 0;
  }
  return [...map.values()].sort((a, b) => b.lost - a.lost); // biggest threat first
}

/** Observations older than `days` — stale intelligence worth refreshing. */
export function staleObservations(
  observations: CompetitorObservation[],
  today: string,
  days = 90,
): CompetitorObservation[] {
  const [y, m, d] = today.split('-').map(Number);
  const cutoffDate = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - days);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  return observations.filter((o) => o.observedOn < cutoff);
}
