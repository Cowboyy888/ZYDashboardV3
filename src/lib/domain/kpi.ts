/**
 * Salesperson KPI scorecard + sales targets — pure, no-I/O (toolkit sheets 07
 * and 18).
 *
 *   % of target      E = actual / target
 *                    lower-is-better lines: IF(actual <= target, 1, target/actual)
 *   weighted score   F = weight × E × 100
 *   total score      SUM(F)
 *   rating           ≥100 Outstanding · ≥85 Strong · ≥70 Developing
 *                    · ≥50 Concern · <50 Serious
 *
 *   GP target        D = revenue target × target margin %
 *
 * Weights are set once with the owner and sum to 1.00; gross profit carries the
 * heaviest weight because it is what the company actually banks.
 */

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// --- Scorecard -----------------------------------------------------------------

export interface KpiLine {
  label: string;
  weight: number;
  target: number | null;
  actual: number | null;
  /** Collections/overdue style lines score best when the actual is LOW. */
  lowerIsBetter?: boolean;
}

/**
 * `E` — attainment against target, as a ratio (1 = exactly on target).
 * Returns null when there is no target to measure against, so the UI can show
 * "—" rather than a misleading 0%.
 */
export function pctOfTarget(line: KpiLine): number | null {
  const target = num(line.target);
  if (line.target == null || target === 0) return null;
  const actual = num(line.actual);
  if (line.lowerIsBetter) {
    // At or under target is full marks; over target degrades proportionally.
    return actual <= target ? 1 : target / actual;
  }
  return actual / target;
}

/** `F = weight × E × 100`. Null when the line has no target. */
export function weightedScore(line: KpiLine): number | null {
  const pct = pctOfTarget(line);
  if (pct == null) return null;
  return round2(num(line.weight) * pct * 100);
}

export const KPI_RATINGS = ['outstanding', 'strong', 'developing', 'concern', 'serious'] as const;
export type KpiRating = (typeof KPI_RATINGS)[number];

export const KPI_RATING_LABELS: Record<KpiRating, { en: string; zh: string }> = {
  outstanding: { en: 'Outstanding', zh: '优秀' },
  strong: { en: 'Strong', zh: '良好' },
  developing: { en: 'Developing', zh: '成长中' },
  concern: { en: 'Concern', zh: '需关注' },
  serious: { en: 'Serious', zh: '严重' },
};

/** The workbook's rating bands. */
export function ratingForScore(score: number): KpiRating {
  if (score >= 100) return 'outstanding';
  if (score >= 85) return 'strong';
  if (score >= 70) return 'developing';
  if (score >= 50) return 'concern';
  return 'serious';
}

export interface ScorecardResult {
  totalScore: number;
  totalWeight: number;
  rating: KpiRating;
  lines: Array<KpiLine & { pctOfTarget: number | null; weightedScore: number | null }>;
  /** True when the weights do not sum to 1.00 (a setup mistake worth flagging). */
  weightsUnbalanced: boolean;
}

/** Score a whole card: per-line attainment, the total, and the rating. */
export function scoreCard(lines: KpiLine[]): ScorecardResult {
  const scored = lines.map((l) => ({
    ...l,
    pctOfTarget: pctOfTarget(l),
    weightedScore: weightedScore(l),
  }));
  const totalScore = round2(scored.reduce((s, l) => s + (l.weightedScore ?? 0), 0));
  const totalWeight = round2(lines.reduce((s, l) => s + num(l.weight), 0));
  return {
    totalScore,
    totalWeight,
    rating: ratingForScore(totalScore),
    lines: scored,
    weightsUnbalanced: Math.abs(totalWeight - 1) > 0.001,
  };
}

/** The workbook's default eight KPI lines and their weights (sum = 1.00). */
export const DEFAULT_KPI_LINES: Array<Pick<KpiLine, 'label' | 'weight' | 'lowerIsBetter'>> = [
  { label: 'Gross profit generated 毛利', weight: 0.3 },
  { label: 'Revenue 销售额', weight: 0.15 },
  { label: 'New customers 新客户', weight: 0.1 },
  { label: 'Quotations issued 报价数', weight: 0.1 },
  { label: 'Activity KPI attainment 活动达成', weight: 0.1 },
  { label: 'Follow-up compliance 跟进合规', weight: 0.1 },
  { label: 'CRM compliance CRM 合规', weight: 0.05 },
  { label: 'Collections — portfolio overdue 逾期占比', weight: 0.1, lowerIsBetter: true },
];

// --- Targets --------------------------------------------------------------------

export interface SalesTarget {
  revenueTarget: number | null;
  targetMarginPct: number | null;
}

/** `D = B × C` — the gross-profit target implied by revenue × margin. */
export function gpTarget(t: SalesTarget): number {
  return round2(num(t.revenueTarget) * num(t.targetMarginPct));
}

export interface ActivityTargets {
  quotationsWeek: number;
  qualifiedWeek: number;
  contactsDay: number;
  visitsDay: number;
  leadsDay: number;
}

/**
 * Monthly equivalents of the daily/weekly activity targets, so a scorecard can
 * compare them against a month of actuals. Uses the toolkit's working month:
 * 4.33 weeks, 26 working days.
 */
export const WEEKS_PER_MONTH = 4.33;
export const WORKING_DAYS_PER_MONTH = 26;

export function monthlyActivity(a: ActivityTargets) {
  return {
    quotations: Math.round(num(a.quotationsWeek) * WEEKS_PER_MONTH),
    qualified: Math.round(num(a.qualifiedWeek) * WEEKS_PER_MONTH),
    contacts: Math.round(num(a.contactsDay) * WORKING_DAYS_PER_MONTH),
    visits: Math.round(num(a.visitsDay) * WORKING_DAYS_PER_MONTH),
    leads: Math.round(num(a.leadsDay) * WORKING_DAYS_PER_MONTH),
  };
}

/**
 * Average order value implied by a revenue target and an order count — the
 * sanity check that stops a target being arithmetically impossible.
 */
export function impliedOrderValue(revenueTarget: number, orders: number): number {
  if (num(orders) <= 0) return 0;
  return round2(num(revenueTarget) / num(orders));
}
