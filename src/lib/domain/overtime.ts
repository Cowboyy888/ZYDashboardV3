/**
 * Overtime (加班) — pure, no-I/O business rules.
 *
 * Transcribed from the 加班表 sheet of 每天跟进考勤表:
 *
 *   F = 1.25 * E     tier 1 hours (16:30–18:00) @ $1.25/h
 *   H = 2.00 * G     tier 2 hours (18:00–20:00) @ $2.00/h
 *   I = F + H        line total
 *   row 32           SUM of each amount column
 *
 * Two deliberate differences from the spreadsheet:
 *   1. The rates are parameters, not literals — they are configurable in
 *      Settings and snapshotted onto each entry, so changing the rate never
 *      silently re-prices historical overtime.
 *   2. Totals are always derived from the same row set. The source sheet
 *      summed F4:F26 for tier 1 but F4:F31 for the total, so its tier-1
 *      subtotal quietly omitted five rows; deriving totals removes that class
 *      of error entirely.
 */

/** Spreadsheet defaults — only used when no settings row is available. */
export const DEFAULT_TIER1_RATE = 1.25;
export const DEFAULT_TIER2_RATE = 2.0;
export const DEFAULT_TIER1_LABEL = '16:30-18:00';
export const DEFAULT_TIER2_LABEL = '18:00-20:00';

export interface OvertimeRates {
  tier1Rate: number;
  tier2Rate: number;
}

export const DEFAULT_OVERTIME_RATES: OvertimeRates = {
  tier1Rate: DEFAULT_TIER1_RATE,
  tier2Rate: DEFAULT_TIER2_RATE,
};

/** Round to 2 decimals (money) without floating-point drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const safe = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;

/** `F = 1.25 * E` — tier-1 amount. */
export function tier1Amount(hours: number | null, rate = DEFAULT_TIER1_RATE): number {
  return round2(safe(hours) * safe(rate));
}

/** `H = 2 * G` — tier-2 amount. */
export function tier2Amount(hours: number | null, rate = DEFAULT_TIER2_RATE): number {
  return round2(safe(hours) * safe(rate));
}

export interface OvertimeHours {
  tier1Hours: number | null;
  tier2Hours: number | null;
}

/** `I = F + H` — the line total for one overtime entry. */
export function overtimeTotal(
  hours: OvertimeHours,
  rates: OvertimeRates = DEFAULT_OVERTIME_RATES,
): number {
  return round2(
    tier1Amount(hours.tier1Hours, rates.tier1Rate) + tier2Amount(hours.tier2Hours, rates.tier2Rate),
  );
}

/** Total paid hours (both tiers) for one entry. */
export function totalHours(hours: OvertimeHours): number {
  return round2(safe(hours.tier1Hours) + safe(hours.tier2Hours));
}

/**
 * Effective blended hourly rate for an entry — useful on the dashboard to spot
 * unusually expensive overtime. Returns 0 when no hours were worked.
 */
export function blendedRate(
  hours: OvertimeHours,
  rates: OvertimeRates = DEFAULT_OVERTIME_RATES,
): number {
  const h = totalHours(hours);
  if (h <= 0) return 0;
  return round2(overtimeTotal(hours, rates) / h);
}

// --- Splitting a worked window into the two tiers ------------------------------

/** Minutes since midnight for `HH:mm` / `HH：mm` (full-width colon tolerated). */
export function parseClock(value: string): number | null {
  const m = value
    .trim()
    .replace(/：/g, ':')
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Tier boundaries as minutes since midnight (16:30 / 18:00 / 20:00). */
export const TIER1_START = 16 * 60 + 30;
export const TIER1_END = 18 * 60;
export const TIER2_END = 20 * 60;

/**
 * Split a worked window (e.g. "16:30-20:00") into tier-1 / tier-2 hours, so the
 * entry form can auto-fill the hour fields the way the sheet's author did by
 * hand. Overlap outside the tier windows is ignored. Returns null when the
 * range can't be parsed.
 */
export function splitTimeRange(range: string): OvertimeHours | null {
  const parts = range
    .trim()
    .replace(/：/g, ':')
    .split(/\s*[-–—~至]\s*/);
  if (parts.length !== 2) return null;
  const start = parseClock(parts[0] ?? '');
  const end = parseClock(parts[1] ?? '');
  if (start == null || end == null || end <= start) return null;

  const overlap = (a: number, b: number) => Math.max(0, Math.min(end, b) - Math.max(start, a));
  return {
    tier1Hours: round2(overlap(TIER1_START, TIER1_END) / 60),
    tier2Hours: round2(overlap(TIER1_END, TIER2_END) / 60),
  };
}

// --- Dashboard summary ---------------------------------------------------------

/** Minimal shape the dashboard needs from each stored overtime entry. */
export interface OvertimeEntryLike {
  businessDate: string;
  employeeId: string;
  description: string | null;
  tier1Hours: number;
  tier2Hours: number;
  tier1Amount: number;
  tier2Amount: number;
  totalAmount: number;
}

export interface OvertimeRollup {
  key: string;
  hours: number;
  amount: number;
  entries: number;
}

export interface OvertimeSummary {
  entries: number;
  tier1Hours: number;
  tier2Hours: number;
  totalHours: number;
  tier1Amount: number;
  tier2Amount: number;
  totalAmount: number;
  /** Distinct employees with at least one overtime entry. */
  people: number;
  byEmployee: OvertimeRollup[];
  byTask: OvertimeRollup[];
  byDate: OvertimeRollup[];
}

function rollup(map: Map<string, OvertimeRollup>, key: string, hours: number, amount: number) {
  const r = map.get(key) ?? { key, hours: 0, amount: 0, entries: 0 };
  r.hours = round2(r.hours + hours);
  r.amount = round2(r.amount + amount);
  r.entries += 1;
  map.set(key, r);
}

/**
 * Aggregate overtime entries for the dashboard. Every total is derived from the
 * SAME set of rows — the spreadsheet's mismatched SUM ranges cannot recur.
 */
export function summarizeOvertime(rows: OvertimeEntryLike[]): OvertimeSummary {
  const byEmployee = new Map<string, OvertimeRollup>();
  const byTask = new Map<string, OvertimeRollup>();
  const byDate = new Map<string, OvertimeRollup>();

  let t1h = 0;
  let t2h = 0;
  let t1a = 0;
  let t2a = 0;
  let total = 0;

  for (const r of rows) {
    const hours = safe(r.tier1Hours) + safe(r.tier2Hours);
    t1h += safe(r.tier1Hours);
    t2h += safe(r.tier2Hours);
    t1a += safe(r.tier1Amount);
    t2a += safe(r.tier2Amount);
    total += safe(r.totalAmount);

    rollup(byEmployee, r.employeeId, hours, safe(r.totalAmount));
    rollup(byTask, (r.description ?? '').trim() || '—', hours, safe(r.totalAmount));
    rollup(byDate, r.businessDate, hours, safe(r.totalAmount));
  }

  const desc = (a: OvertimeRollup, b: OvertimeRollup) => b.amount - a.amount;
  return {
    entries: rows.length,
    tier1Hours: round2(t1h),
    tier2Hours: round2(t2h),
    totalHours: round2(t1h + t2h),
    tier1Amount: round2(t1a),
    tier2Amount: round2(t2a),
    totalAmount: round2(total),
    people: byEmployee.size,
    byEmployee: [...byEmployee.values()].sort(desc),
    byTask: [...byTask.values()].sort(desc),
    byDate: [...byDate.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
