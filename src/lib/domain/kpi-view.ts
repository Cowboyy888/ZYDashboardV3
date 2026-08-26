/**
 * Pure assembly of Sales Target + KPI Scorecard display rows from raw DB rows
 * + employee names. Named `*DisplayRow` (not `*Row`, which src/lib/db/types.ts
 * already uses for the raw DB shapes) so a page can import both without a
 * collision. scoreCard() (kpi.ts) does the actual math — this file only shapes
 * data for rendering.
 */
import { gpTarget, impliedOrderValue, scoreCard, type KpiLine, type KpiRating } from './kpi';

export interface EmployeeLike {
  id: string;
  employee_code: string;
  display_name: string | null;
  name_english: string | null;
  name_chinese: string | null;
}

/** Same fallback chain used elsewhere in the app (Payroll/Employees/Attendance pages). */
function employeeName(e: EmployeeLike | undefined, fallbackId: string): string {
  if (!e) return fallbackId;
  return e.display_name || e.name_english || e.name_chinese || e.employee_code;
}

// --- Sales targets (sheet 18) ----------------------------------------------------

export interface SalesTargetLike {
  id: string;
  employee_id: string;
  period: string;
  revenue_target: number;
  target_margin_pct: number;
  orders_target: number;
  new_customers: number;
  quotations_week: number;
  qualified_week: number;
  contacts_day: number;
  visits_day: number;
  leads_day: number;
  notes: string | null;
}

export interface SalesTargetDisplayRow {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  revenueTarget: number;
  targetMarginPct: number;
  gpTarget: number;
  ordersTarget: number;
  newCustomers: number;
  quotationsWeek: number;
  qualifiedWeek: number;
  contactsDay: number;
  visitsDay: number;
  leadsDay: number;
  impliedOrderValue: number;
  notes: string | null;
}

export function buildSalesTargetRows(
  targets: SalesTargetLike[],
  employees: EmployeeLike[],
): SalesTargetDisplayRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  return targets.map((t) => ({
    id: t.id,
    employeeId: t.employee_id,
    employeeName: employeeName(employeeById.get(t.employee_id), t.employee_id),
    period: t.period,
    revenueTarget: t.revenue_target,
    targetMarginPct: t.target_margin_pct,
    gpTarget: gpTarget({ revenueTarget: t.revenue_target, targetMarginPct: t.target_margin_pct }),
    ordersTarget: t.orders_target,
    newCustomers: t.new_customers,
    quotationsWeek: t.quotations_week,
    qualifiedWeek: t.qualified_week,
    contactsDay: t.contacts_day,
    visitsDay: t.visits_day,
    leadsDay: t.leads_day,
    impliedOrderValue: impliedOrderValue(t.revenue_target, t.orders_target),
    notes: t.notes,
  }));
}

// --- KPI scorecards (sheet 07) ---------------------------------------------------

export interface KpiScorecardLike {
  id: string;
  employee_id: string;
  period: string;
  notes: string | null;
}

export interface KpiScorecardLineLike {
  id: string;
  scorecard_id: string;
  line_no: number;
  label: string;
  weight: number;
  target_value: number | null;
  actual_value: number | null;
  lower_is_better: boolean;
}

export interface KpiScorecardDisplayRow {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  notes: string | null;
  lines: Array<KpiLine & { pctOfTarget: number | null; weightedScore: number | null }>;
  totalScore: number;
  totalWeight: number;
  rating: KpiRating;
  weightsUnbalanced: boolean;
}

export function buildKpiScorecardRows(
  scorecards: KpiScorecardLike[],
  lines: KpiScorecardLineLike[],
  employees: EmployeeLike[],
): KpiScorecardDisplayRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const linesByCard = new Map<string, KpiScorecardLineLike[]>();
  for (const l of lines) {
    if (!linesByCard.has(l.scorecard_id)) linesByCard.set(l.scorecard_id, []);
    linesByCard.get(l.scorecard_id)!.push(l);
  }

  return scorecards.map((c) => {
    const cardLines = (linesByCard.get(c.id) ?? []).sort((a, b) => a.line_no - b.line_no);
    const kpiLines: KpiLine[] = cardLines.map((l) => ({
      label: l.label,
      weight: l.weight,
      target: l.target_value,
      actual: l.actual_value,
      lowerIsBetter: l.lower_is_better,
    }));
    const result = scoreCard(kpiLines);
    return {
      id: c.id,
      employeeId: c.employee_id,
      employeeName: employeeName(employeeById.get(c.employee_id), c.employee_id),
      period: c.period,
      notes: c.notes,
      lines: result.lines,
      totalScore: result.totalScore,
      totalWeight: result.totalWeight,
      rating: result.rating,
      weightsUnbalanced: result.weightsUnbalanced,
    };
  });
}
