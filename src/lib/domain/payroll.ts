/**
 * Payroll — pure, no-I/O business rules.
 *
 * Confirmed rules (explicit product decisions, not guessed):
 *   - Every employee is paid daily: daily_rate × count of DISTINCT business
 *     dates in the period with a 'present' or 'late' attendance status
 *     (either shift counts — a day is never double-counted across morning +
 *     afternoon). Monthly-salary pay was removed (employees.pay_type is
 *     constrained to 'daily' — see migration 0016).
 *   - USD only — no currency field, matching employee_private.
 *   - Deductions/advances are simple named line items per run; no
 *     cross-period running balance.
 *
 * `days_worked`/`rate`/`base_amount` are snapshots taken once at generation
 * time (see `create_draft_payroll_run` RPC) — this file's job is just the
 * pure arithmetic/status logic, kept separate from the DB so it is
 * unit-testable independently of the trigger that also enforces it.
 */

export const PAYROLL_STATUSES = ['draft', 'approved', 'paid', 'cancelled'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, { en: string; zh: string }> = {
  draft: { en: 'Draft', zh: '草稿' },
  approved: { en: 'Approved', zh: '已批准' },
  paid: { en: 'Paid', zh: '已发放' },
  cancelled: { en: 'Cancelled', zh: '已取消' },
};

/** Attendance statuses that count as a worked day for daily-rate pay. */
export const WORKED_STATUSES = ['present', 'late'] as const;

export function isWorkedStatus(status: string): boolean {
  return (WORKED_STATUSES as readonly string[]).includes(status);
}

/**
 * Count DISTINCT business dates with a worked (present/late) attendance
 * status. Mirrors `create_draft_payroll_run`'s SQL exactly (`count(distinct
 * business_date) ... where status in ('present','late')`) — a day with both
 * shifts marked present/late is counted once, never twice.
 */
export function countWorkedDays(records: { businessDate: string; status: string }[]): number {
  const dates = new Set(records.filter((r) => isWorkedStatus(r.status)).map((r) => r.businessDate));
  return dates.size;
}

export const DEDUCTION_KINDS = ['deduction', 'advance'] as const;
export type DeductionKind = (typeof DEDUCTION_KINDS)[number];

/** Round to 2 decimal places (money), avoiding floating-point drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Net pay for one payslip line = base amount minus its deduction/advance lines. */
export function computeNetAmount(baseAmount: number, deductionsTotal: number): number {
  return round2(baseAmount - deductionsTotal);
}

/** Only a Draft run may have its items/lines edited, or be regenerated/discarded. */
export function canEditRun(status: PayrollStatus): boolean {
  return status === 'draft';
}

/** Only a Draft run may be approved (and only by an Owner — enforced by the DB trigger too). */
export function canApproveRun(status: PayrollStatus): boolean {
  return status === 'draft';
}

/** Only an Approved run may be marked Paid. */
export function canMarkPaid(status: PayrollStatus): boolean {
  return status === 'approved';
}

/**
 * Days-worked/base/overtime stay live (recomputed from current attendance)
 * through Draft AND Approved — Paid is the actual freeze point, not Approve.
 * Approving is a sign-off checkpoint (still requires an Owner), not a data
 * freeze; only marking a run Paid snapshots the final numbers permanently.
 */
export function isPayrollLive(status: PayrollStatus): boolean {
  return status === 'draft' || status === 'approved';
}

/** A run may be cancelled from Draft or Approved — Paid is terminal. */
export function canCancelRun(status: PayrollStatus): boolean {
  return status === 'draft' || status === 'approved';
}
