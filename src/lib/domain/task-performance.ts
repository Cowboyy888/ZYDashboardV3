/**
 * Pure assembly of Task + Daily Metric display rows from raw DB rows +
 * employee names. Same split as kpi-view.ts: that file does KPI math, this
 * one only shapes task/activity data for rendering (Weekly Dashboard,
 * Employee Performance Table, Employee Detail daily breakdown). No I/O.
 */
import { summarizeTasks, mergeCounts, type TaskCounts, type TaskLike } from './tasks';

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

export interface TaskRowLike extends TaskLike {
  id: string;
  title: string;
  departmentId: string;
}

export interface MetricRowLike {
  employeeId: string;
  businessDate: string;
  metricKey: string;
  value: number;
}

function sumMetrics(metrics: MetricRowLike[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const m of metrics) totals[m.metricKey] = (totals[m.metricKey] ?? 0) + m.value;
  return totals;
}

// --- Employee performance table (spec §6) / Weekly dashboard (spec §5) ----------

export interface EmployeePerformanceRow {
  employeeId: string;
  employeeName: string;
  counts: TaskCounts;
  /** metricKey -> summed value over the queried date range. */
  metrics: Record<string, number>;
}

/** One row per employee who has at least one task or metric entry in range. */
export function buildEmployeePerformanceRows(
  tasks: TaskRowLike[],
  metrics: MetricRowLike[],
  employees: EmployeeLike[],
  today: string,
): EmployeePerformanceRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const tasksByEmployee = new Map<string, TaskRowLike[]>();
  for (const t of tasks) {
    if (!tasksByEmployee.has(t.employeeId)) tasksByEmployee.set(t.employeeId, []);
    tasksByEmployee.get(t.employeeId)!.push(t);
  }
  const metricsByEmployee = new Map<string, MetricRowLike[]>();
  for (const m of metrics) {
    if (!metricsByEmployee.has(m.employeeId)) metricsByEmployee.set(m.employeeId, []);
    metricsByEmployee.get(m.employeeId)!.push(m);
  }

  const employeeIds = new Set<string>([...tasksByEmployee.keys(), ...metricsByEmployee.keys()]);
  return [...employeeIds].map((employeeId) => ({
    employeeId,
    employeeName: employeeName(employeeById.get(employeeId), employeeId),
    counts: summarizeTasks(tasksByEmployee.get(employeeId) ?? [], today),
    metrics: sumMetrics(metricsByEmployee.get(employeeId) ?? []),
  }));
}

export interface TeamOverview {
  totalEmployees: number;
  counts: TaskCounts;
  metrics: Record<string, number>;
}

/** Team Overview block (spec §5) — sums the already-built per-employee rows. */
export function buildTeamOverview(rows: EmployeePerformanceRow[]): TeamOverview {
  const metrics: Record<string, number> = {};
  for (const r of rows) {
    for (const [key, value] of Object.entries(r.metrics))
      metrics[key] = (metrics[key] ?? 0) + value;
  }
  return {
    totalEmployees: rows.length,
    counts: mergeCounts(rows.map((r) => r.counts)),
    metrics,
  };
}

// --- Employee Detail daily breakdown (spec §7) -----------------------------------

export interface DayBreakdown {
  businessDate: string;
  tasks: TaskRowLike[];
  metrics: Record<string, number>;
}

/** One entry per date in `dates` (e.g. a week's 7 business dates, in order). */
export function buildDailyBreakdown(
  tasks: TaskRowLike[],
  metrics: MetricRowLike[],
  dates: string[],
): DayBreakdown[] {
  return dates.map((businessDate) => ({
    businessDate,
    tasks: tasks.filter((t) => t.businessDate === businessDate),
    metrics: sumMetrics(metrics.filter((m) => m.businessDate === businessDate)),
  }));
}
