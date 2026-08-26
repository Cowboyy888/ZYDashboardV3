/**
 * Sales forecast — pure, no-I/O (toolkit sheet 17).
 *
 *   Weighted  F = D × E    value × probability
 *
 * "Probability comes from the STAGE, not from feeling" — so this module never
 * invents a probability; it takes what the pipeline already snapshotted.
 *
 * The three scenarios the monthly meeting asks for:
 *   commit  — only what is nearly certain (probability ≥ COMMIT_THRESHOLD)
 *   likely  — the weighted pipeline, the honest number
 *   best    — every open deal landing in full
 * commit ≤ likely ≤ best always holds, which is what makes them useful as a
 * range rather than three unrelated guesses.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** A deal is "commit" once it is at or above this probability. */
export const COMMIT_THRESHOLD = 0.9;

export interface ForecastDeal {
  value: number | null;
  probability: number | null;
  /** ISO `YYYY-MM-DD`; deals without one cannot be placed in a month. */
  expectedCloseDate: string | null;
  tonnage?: number | null;
  familyId?: string | null;
  ownerId?: string | null;
}

/** `F = D × E`. */
export function weighted(deal: ForecastDeal): number {
  return round2(num(deal.value) * num(deal.probability));
}

export interface ForecastScenarios {
  commit: number;
  likely: number;
  best: number;
}

/** The three-scenario range for a set of deals. */
export function scenarios(deals: ForecastDeal[]): ForecastScenarios {
  let commit = 0;
  let likely = 0;
  let best = 0;
  for (const d of deals) {
    const value = num(d.value);
    best += value;
    likely += weighted(d);
    if (num(d.probability) >= COMMIT_THRESHOLD) commit += value;
  }
  return { commit: round2(commit), likely: round2(likely), best: round2(best) };
}

/** `YYYY-MM` bucket for a close date (null when undated). */
export function forecastMonth(isoDate: string | null): string | null {
  if (!isoDate || isoDate.length < 7) return null;
  return isoDate.slice(0, 7);
}

export interface MonthBucket {
  month: string;
  deals: number;
  value: number;
  weighted: number;
  tonnage: number;
}

/**
 * Group the forecast by expected close month, oldest first. Deals with no
 * expected close date are returned separately — they are not "no revenue",
 * they are unforecastable work that needs a date.
 */
export function forecastByMonth(deals: ForecastDeal[]): {
  months: MonthBucket[];
  undated: MonthBucket;
} {
  const map = new Map<string, MonthBucket>();
  const undated: MonthBucket = { month: '', deals: 0, value: 0, weighted: 0, tonnage: 0 };

  for (const d of deals) {
    const month = forecastMonth(d.expectedCloseDate);
    const bucket =
      month == null
        ? undated
        : (map.get(month) ?? { month, deals: 0, value: 0, weighted: 0, tonnage: 0 });

    bucket.deals += 1;
    bucket.value = round2(bucket.value + num(d.value));
    bucket.weighted = round2(bucket.weighted + weighted(d));
    bucket.tonnage = round2(bucket.tonnage + num(d.tonnage));
    if (month != null) map.set(month, bucket);
  }

  return {
    months: [...map.values()].sort((a, b) => a.month.localeCompare(b.month)),
    undated,
  };
}

/** Add whole days to an ISO date. */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/**
 * The 90-day view the monthly meeting runs on: deals expected to close within
 * `days` of `today`. Deals already past their expected close date are included
 * — they have not gone away, they have slipped, and that is the point.
 */
export function forecastWindow(
  deals: ForecastDeal[],
  today: string,
  days = 90,
): { deals: ForecastDeal[]; scenarios: ForecastScenarios; slipped: number } {
  const horizon = addDays(today, days);
  const inWindow = deals.filter(
    (d) => d.expectedCloseDate != null && d.expectedCloseDate <= horizon,
  );
  const slipped = inWindow.filter((d) => (d.expectedCloseDate as string) < today).length;
  return { deals: inWindow, scenarios: scenarios(inWindow), slipped };
}

export interface MixRollup {
  key: string;
  deals: number;
  value: number;
  tonnage: number;
}

/** Tonnage + value mix by product family, for the factory's planning. */
export function tonnageMix(deals: ForecastDeal[]): MixRollup[] {
  const map = new Map<string, MixRollup>();
  for (const d of deals) {
    const key = d.familyId ?? '—';
    const r = map.get(key) ?? { key, deals: 0, value: 0, tonnage: 0 };
    r.deals += 1;
    r.value = round2(r.value + num(d.value));
    r.tonnage = round2(r.tonnage + num(d.tonnage));
    map.set(key, r);
  }
  return [...map.values()].sort((a, b) => b.tonnage - a.tonnage);
}
