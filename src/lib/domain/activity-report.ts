/**
 * Daily / weekly / monthly sales reporting — pure, no-I/O (toolkit sheets 01,
 * 03 and 04).
 *
 *   Daily    M = IF(due = 0, 1, done / due)   follow-up compliance
 *   Weekly   J = revenue − cost               gross profit
 *            K = J / revenue                  margin %
 *   Monthly  D = actual / target              achievement
 *
 * The weekly and monthly sheets are roll-ups of the dailies, so they are
 * computed here rather than stored — a stored weekly total is a copy that can
 * disagree with the days it came from.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

// --- 01 · Daily ------------------------------------------------------------------

export interface DailyActivity {
  businessDate: string;
  employeeId: string;
  newLeads: number | null;
  calls: number | null;
  messages: number | null;
  followUpsDone: number | null;
  followUpsDue: number | null;
  fieldVisits: number | null;
  quotations: number | null;
  quotationValue: number | null;
  orders: number | null;
  orderValue: number | null;
}

/**
 * `M` — follow-up compliance. Nothing due is full compliance (not a
 * divide-by-zero, and not a zero score for a day with no follow-ups owed).
 * Capped at 1 so doing extra cannot mask a different day's miss.
 */
export function followUpCompliance(done: number | null, due: number | null): number {
  const d = num(due);
  if (d <= 0) return 1;
  return Math.min(1, num(done) / d);
}

/** Total outbound touches — the workbook's "contacts" measure. */
export function totalContacts(a: DailyActivity): number {
  return num(a.calls) + num(a.messages) + num(a.fieldVisits);
}

export interface ActivityTotals {
  days: number;
  newLeads: number;
  calls: number;
  messages: number;
  fieldVisits: number;
  contacts: number;
  followUpsDone: number;
  followUpsDue: number;
  followUpCompliance: number;
  quotations: number;
  quotationValue: number;
  orders: number;
  orderValue: number;
  /** Distinct people who filed a report. */
  people: number;
}

/**
 * Sum a set of daily rows. Compliance is recomputed from the summed done/due
 * — averaging daily percentages would weight a quiet day the same as a busy
 * one.
 */
export function totalActivity(rows: DailyActivity[]): ActivityTotals {
  const people = new Set<string>();
  let newLeads = 0;
  let calls = 0;
  let messages = 0;
  let fieldVisits = 0;
  let done = 0;
  let due = 0;
  let quotations = 0;
  let quotationValue = 0;
  let orders = 0;
  let orderValue = 0;

  for (const r of rows) {
    people.add(r.employeeId);
    newLeads += num(r.newLeads);
    calls += num(r.calls);
    messages += num(r.messages);
    fieldVisits += num(r.fieldVisits);
    done += num(r.followUpsDone);
    due += num(r.followUpsDue);
    quotations += num(r.quotations);
    quotationValue += num(r.quotationValue);
    orders += num(r.orders);
    orderValue += num(r.orderValue);
  }

  return {
    days: new Set(rows.map((r) => r.businessDate)).size,
    newLeads,
    calls,
    messages,
    fieldVisits,
    contacts: calls + messages + fieldVisits,
    followUpsDone: done,
    followUpsDue: due,
    followUpCompliance: followUpCompliance(done, due),
    quotations,
    quotationValue: round2(quotationValue),
    orders,
    orderValue: round2(orderValue),
    people: people.size,
  };
}

// --- 03 · Weekly ------------------------------------------------------------------

export interface WeeklyInput {
  revenue: number | null;
  cost: number | null;
}

/** `J = revenue − cost`. */
export function grossProfit(w: WeeklyInput): number {
  return round2(num(w.revenue) - num(w.cost));
}

/** `K = J / revenue`. Zero revenue yields a zero margin, never a division error. */
export function marginPct(w: WeeklyInput): number {
  const r = num(w.revenue);
  if (r <= 0) return 0;
  return (r - num(w.cost)) / r;
}

/** Conversion from quotations issued to orders won. */
export function quoteToOrderRate(quotations: number, orders: number): number {
  const q = num(quotations);
  if (q <= 0) return 0;
  return num(orders) / q;
}

export interface WeeklySummary extends ActivityTotals {
  revenue: number;
  cost: number;
  grossProfit: number;
  marginPct: number;
  quoteToOrderRate: number;
}

/** Roll dailies up into the Monday-meeting numbers. */
export function weeklySummary(
  rows: DailyActivity[],
  financials: WeeklyInput = { revenue: null, cost: null },
): WeeklySummary {
  const totals = totalActivity(rows);
  // Fall back to the summed order value when no separate revenue is supplied.
  const revenue = financials.revenue == null ? totals.orderValue : num(financials.revenue);
  const w = { revenue, cost: financials.cost };
  return {
    ...totals,
    revenue: round2(revenue),
    cost: round2(num(financials.cost)),
    grossProfit: grossProfit(w),
    marginPct: marginPct(w),
    quoteToOrderRate: quoteToOrderRate(totals.quotations, totals.orders),
  };
}

// --- 04 · Monthly ------------------------------------------------------------------

/** `D = actual / target`. Null when there is no target to measure against. */
export function achievement(actual: number | null, target: number | null): number | null {
  const t = num(target);
  if (target == null || t === 0) return null;
  return num(actual) / t;
}

export interface MetricLine {
  label: string;
  target: number | null;
  actual: number | null;
}

export interface ScoredMetric extends MetricLine {
  achievement: number | null;
  /** Shortfall against target; 0 when on or above target. */
  gap: number;
}

/**
 * Score the monthly report's metric lines. The gap is stated as a number
 * because "we are 12% behind" is an argument, while "$3,800 behind" is a task.
 */
export function scoreMetrics(lines: MetricLine[]): ScoredMetric[] {
  return lines.map((l) => ({
    ...l,
    achievement: achievement(l.actual, l.target),
    gap: Math.max(0, round2(num(l.target) - num(l.actual))),
  }));
}
