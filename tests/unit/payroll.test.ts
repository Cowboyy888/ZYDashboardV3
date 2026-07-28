import { describe, it, expect } from 'vitest';
import {
  isWorkedStatus,
  countWorkedDays,
  round2,
  computeNetAmount,
  canEditRun,
  canApproveRun,
  canMarkPaid,
  canCancelRun,
  WORKED_STATUSES,
  PAYROLL_STATUSES,
  DEDUCTION_KINDS,
} from '@/lib/domain/payroll';

describe('isWorkedStatus — the confirmed daily-rate counting rule', () => {
  it('present and late both count as a worked day', () => {
    expect(isWorkedStatus('present')).toBe(true);
    expect(isWorkedStatus('late')).toBe(true);
  });
  it('leave and absent do not count', () => {
    expect(isWorkedStatus('leave')).toBe(false);
    expect(isWorkedStatus('absent')).toBe(false);
  });
  it('WORKED_STATUSES is exactly [present, late]', () => {
    expect(WORKED_STATUSES).toEqual(['present', 'late']);
  });
});

describe('countWorkedDays — never double-counts a day across morning + afternoon shifts', () => {
  it('counts a day once even with both shifts marked present/late', () => {
    const records = [
      { businessDate: '2026-07-01', status: 'present' }, // morning
      { businessDate: '2026-07-01', status: 'late' }, // afternoon, same day
      { businessDate: '2026-07-02', status: 'present' },
    ];
    expect(countWorkedDays(records)).toBe(2);
  });
  it('excludes leave/absent days', () => {
    const records = [
      { businessDate: '2026-07-01', status: 'present' },
      { businessDate: '2026-07-02', status: 'leave' },
      { businessDate: '2026-07-03', status: 'absent' },
    ];
    expect(countWorkedDays(records)).toBe(1);
  });
  it('is zero for no attendance at all', () => {
    expect(countWorkedDays([])).toBe(0);
  });
});

describe('round2 — money rounding', () => {
  it('rounds to 2 decimal places, avoiding float drift', () => {
    expect(round2(90)).toBe(90);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(18 * 5.005)).toBe(90.09);
  });
});

describe('computeNetAmount — base amount minus deductions/advances', () => {
  it('subtracts the deductions total from the base amount', () => {
    expect(computeNetAmount(450, 0)).toBe(450);
    expect(computeNetAmount(450, 50)).toBe(400);
  });
  it('can go negative if deductions exceed the base amount (still a valid, visible figure)', () => {
    expect(computeNetAmount(90, 150)).toBe(-60);
  });
});

describe('run status transitions', () => {
  it('only a Draft run is editable', () => {
    expect(canEditRun('draft')).toBe(true);
    expect(canEditRun('approved')).toBe(false);
    expect(canEditRun('paid')).toBe(false);
    expect(canEditRun('cancelled')).toBe(false);
  });

  it('only a Draft run can be approved', () => {
    expect(canApproveRun('draft')).toBe(true);
    expect(canApproveRun('approved')).toBe(false);
    expect(canApproveRun('paid')).toBe(false);
    expect(canApproveRun('cancelled')).toBe(false);
  });

  it('only an Approved run can be marked Paid', () => {
    expect(canMarkPaid('approved')).toBe(true);
    expect(canMarkPaid('draft')).toBe(false);
    expect(canMarkPaid('paid')).toBe(false);
    expect(canMarkPaid('cancelled')).toBe(false);
  });

  it('a run may be cancelled from Draft or Approved, not Paid (terminal)', () => {
    expect(canCancelRun('draft')).toBe(true);
    expect(canCancelRun('approved')).toBe(true);
    expect(canCancelRun('paid')).toBe(false);
    expect(canCancelRun('cancelled')).toBe(false);
  });
});

describe('enums', () => {
  it('PAYROLL_STATUSES is exactly draft/approved/paid/cancelled', () => {
    expect(PAYROLL_STATUSES).toEqual(['draft', 'approved', 'paid', 'cancelled']);
  });
  it('DEDUCTION_KINDS is exactly deduction/advance', () => {
    expect(DEDUCTION_KINDS).toEqual(['deduction', 'advance']);
  });
});
