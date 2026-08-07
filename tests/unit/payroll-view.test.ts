import { describe, it, expect } from 'vitest';
import {
  buildPayrollRunRows,
  type PayrollItemLike,
  type PayrollRunLike,
} from '@/lib/domain/payroll-view';

const employees = [
  {
    id: 'emp-1',
    employee_code: 'ZY-0001',
    display_name: 'Alice',
    name_english: null,
    name_chinese: null,
  },
];

function item(overrides: Partial<PayrollItemLike> = {}): PayrollItemLike {
  return {
    id: 'item-1',
    payroll_run_id: 'run-1',
    employee_id: 'emp-1',
    pay_type: 'daily',
    days_worked: 10,
    rate: 15,
    base_amount: 150,
    overtime_amount: 5,
    ...overrides,
  };
}

function run(overrides: Partial<PayrollRunLike> = {}): PayrollRunLike {
  return {
    id: 'run-1',
    period_start: '2026-08-01',
    period_end: '2026-08-15',
    pay_date: '2026-08-20',
    status: 'draft',
    notes: null,
    ...overrides,
  };
}

const LIVE_ROW = {
  id: 'item-1',
  live_days_worked: 12,
  live_rate: 15,
  live_base_amount: 180,
  live_overtime_amount: 8,
};

describe('buildPayrollRunRows — live recompute stays on through Draft AND Approved, freezes at Paid', () => {
  it('uses the live figures (not the stored snapshot) for a Draft run when a live row is present', () => {
    const rows = buildPayrollRunRows([run()], [item()], [], [], employees, [LIVE_ROW]);
    const row = rows[0]!.items[0]!;
    expect(row.daysWorked).toBe(12);
    expect(row.baseAmount).toBe(180);
    expect(row.overtimeAmount).toBe(8);
    expect(row.netAmount).toBe(188); // 180 + 8 - 0 deductions
    expect(row.isLive).toBe(true);
  });

  it('falls back to the stored snapshot when a Draft run has no matching live row', () => {
    const rows = buildPayrollRunRows([run()], [item()], [], [], employees, []);
    const row = rows[0]!.items[0]!;
    expect(row.daysWorked).toBe(10);
    expect(row.baseAmount).toBe(150);
    expect(row.isLive).toBe(false);
  });

  it('also stays live once a run is Approved — Approve is a sign-off checkpoint, not a data freeze', () => {
    const rows = buildPayrollRunRows([run({ status: 'approved' })], [item()], [], [], employees, [
      LIVE_ROW,
    ]);
    const row = rows[0]!.items[0]!;
    expect(row.daysWorked).toBe(12);
    expect(row.baseAmount).toBe(180);
    expect(row.isLive).toBe(true);
  });

  it('ignores live rows once a run is Paid — a paid payslip never changes again', () => {
    const rows = buildPayrollRunRows([run({ status: 'paid' })], [item()], [], [], employees, [
      { ...LIVE_ROW, live_days_worked: 99, live_base_amount: 1485 },
    ]);
    const row = rows[0]!.items[0]!;
    expect(row.daysWorked).toBe(10);
    expect(row.baseAmount).toBe(150);
    expect(row.isLive).toBe(false);
  });

  it('ignores live rows once a run is Cancelled', () => {
    const rows = buildPayrollRunRows([run({ status: 'cancelled' })], [item()], [], [], employees, [
      { ...LIVE_ROW, live_days_worked: 99, live_base_amount: 1485 },
    ]);
    const row = rows[0]!.items[0]!;
    expect(row.daysWorked).toBe(10);
    expect(row.isLive).toBe(false);
  });

  it('carries the live base amount through into the run-level gross/net totals', () => {
    const rows = buildPayrollRunRows([run()], [item()], [], [], employees, [LIVE_ROW]);
    expect(rows[0]!.grossTotal).toBe(180);
    expect(rows[0]!.netTotal).toBe(188);
  });
});
