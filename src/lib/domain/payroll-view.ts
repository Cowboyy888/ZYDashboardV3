/**
 * Pure assembly of payroll display rows from master data + the stored
 * snapshot items + the derived deductions view. No I/O.
 */
import { computeNetAmount, round2, type PayrollStatus, type DeductionKind } from './payroll';

export interface PayrollRunLike {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: PayrollStatus;
  notes: string | null;
}

export interface PayrollItemLike {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  pay_type: 'daily';
  days_worked: number | null;
  rate: number;
  base_amount: number;
}

export interface DeductionsLike {
  item_id: string;
  deductions_total: number;
}

export interface LineLike {
  id: string;
  payroll_item_id: string;
  kind: DeductionKind;
  label: string;
  amount: number;
}

export interface EmployeeLike {
  id: string;
  employee_code: string;
  display_name: string | null;
  name_english: string | null;
  name_chinese: string | null;
}

/** Same fallback chain used elsewhere in the app (Employees/Attendance pages). */
export function employeeDisplayName(e: EmployeeLike): string {
  return e.display_name || e.name_english || e.name_chinese || e.employee_code;
}

export interface PayrollLineRow {
  lineId: string;
  kind: DeductionKind;
  label: string;
  amount: number;
}

export interface PayrollItemRow {
  itemId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  payType: 'daily';
  daysWorked: number | null;
  rate: number;
  baseAmount: number;
  deductionsTotal: number;
  netAmount: number;
  lines: PayrollLineRow[];
}

export interface PayrollRunRow {
  runId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: PayrollStatus;
  notes: string | null;
  items: PayrollItemRow[];
  itemCount: number;
  grossTotal: number;
  deductionsTotal: number;
  netTotal: number;
}

/** Assemble full payroll-run rows (with salary figures) — restrict to payroll-privileged roles before rendering. */
export function buildPayrollRunRows(
  runs: PayrollRunLike[],
  items: PayrollItemLike[],
  deductions: DeductionsLike[],
  lines: LineLike[],
  employees: EmployeeLike[],
): PayrollRunRow[] {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const deductionsByItem = new Map(deductions.map((d) => [d.item_id, d.deductions_total]));
  const linesByItem = new Map<string, LineLike[]>();
  for (const l of lines) {
    if (!linesByItem.has(l.payroll_item_id)) linesByItem.set(l.payroll_item_id, []);
    linesByItem.get(l.payroll_item_id)!.push(l);
  }
  const itemsByRun = new Map<string, PayrollItemLike[]>();
  for (const it of items) {
    if (!itemsByRun.has(it.payroll_run_id)) itemsByRun.set(it.payroll_run_id, []);
    itemsByRun.get(it.payroll_run_id)!.push(it);
  }

  return runs.map((run) => {
    const runItems = itemsByRun.get(run.id) ?? [];
    const itemRows: PayrollItemRow[] = runItems.map((it) => {
      const employee = employeeById.get(it.employee_id);
      const deductionsTotal = round2(deductionsByItem.get(it.id) ?? 0);
      const itemLines = (linesByItem.get(it.id) ?? []).map((l) => ({
        lineId: l.id,
        kind: l.kind,
        label: l.label,
        amount: l.amount,
      }));
      return {
        itemId: it.id,
        employeeId: it.employee_id,
        employeeCode: employee?.employee_code ?? it.employee_id,
        employeeName: employee ? employeeDisplayName(employee) : it.employee_id,
        payType: it.pay_type,
        daysWorked: it.days_worked,
        rate: it.rate,
        baseAmount: it.base_amount,
        deductionsTotal,
        netAmount: computeNetAmount(it.base_amount, deductionsTotal),
        lines: itemLines,
      };
    });

    const grossTotal = round2(itemRows.reduce((s, r) => s + r.baseAmount, 0));
    const deductionsTotal = round2(itemRows.reduce((s, r) => s + r.deductionsTotal, 0));
    const netTotal = round2(itemRows.reduce((s, r) => s + r.netAmount, 0));

    return {
      runId: run.id,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      payDate: run.pay_date,
      status: run.status,
      notes: run.notes,
      items: itemRows,
      itemCount: itemRows.length,
      grossTotal,
      deductionsTotal,
      netTotal,
    };
  });
}
