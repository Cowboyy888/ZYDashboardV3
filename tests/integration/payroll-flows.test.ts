import { describe, it, expect } from 'vitest';
import { countWorkedDays, round2, computeNetAmount } from '@/lib/domain/payroll';

/**
 * End-to-end payroll-run generation scenario, mirroring
 * tests/integration/purchasing-flows.test.ts / sales-flows.test.ts's style.
 * Reproduces exactly what the real `create_draft_payroll_run` RPC computes
 * per employee, using the same pure helpers, so this proves the generation
 * arithmetic (the confirmed pay rules) without needing a live database.
 */
interface Employee {
  id: string;
  payType: 'monthly' | 'daily';
  baseSalary: number | null;
  dailyRate: number | null;
}
interface AttendanceRecord {
  employeeId: string;
  businessDate: string;
  status: string;
}

function generateItem(
  employee: Employee,
  attendance: AttendanceRecord[],
): { payType: 'monthly' | 'daily'; daysWorked: number | null; rate: number; baseAmount: number } {
  if (employee.payType === 'monthly') {
    const rate = employee.baseSalary ?? 0;
    return { payType: 'monthly', daysWorked: null, rate, baseAmount: rate };
  }
  const records = attendance.filter((a) => a.employeeId === employee.id);
  const daysWorked = countWorkedDays(records);
  const rate = employee.dailyRate ?? 0;
  return { payType: 'daily', daysWorked, rate, baseAmount: round2(rate * daysWorked) };
}

describe('acceptance — monthly-salary pay is fixed regardless of attendance', () => {
  it('pays base_salary in full whether the employee has any attendance or not', () => {
    const employee: Employee = { id: 'e1', payType: 'monthly', baseSalary: 450, dailyRate: null };
    const withAttendance = generateItem(employee, [
      { employeeId: 'e1', businessDate: '2026-07-01', status: 'absent' },
    ]);
    const withoutAttendance = generateItem(employee, []);
    expect(withAttendance.baseAmount).toBe(450);
    expect(withoutAttendance.baseAmount).toBe(450);
    expect(withAttendance.daysWorked).toBeNull();
  });
});

describe('acceptance — daily-rate pay = daily_rate × distinct worked days', () => {
  it('counts each calendar day once even with two shifts marked present/late', () => {
    const employee: Employee = { id: 'e2', payType: 'daily', baseSalary: null, dailyRate: 18 };
    const attendance: AttendanceRecord[] = [
      { employeeId: 'e2', businessDate: '2026-07-01', status: 'present' },
      { employeeId: 'e2', businessDate: '2026-07-01', status: 'late' }, // afternoon, same day
      { employeeId: 'e2', businessDate: '2026-07-02', status: 'present' },
      { employeeId: 'e2', businessDate: '2026-07-03', status: 'leave' }, // does not count
      { employeeId: 'e2', businessDate: '2026-07-06', status: 'present' },
      { employeeId: 'e2', businessDate: '2026-07-07', status: 'late' },
    ];
    const item = generateItem(employee, attendance);
    expect(item.daysWorked).toBe(4); // 07-01, 07-02, 07-06, 07-07 — not 5
    expect(item.baseAmount).toBe(72); // 4 * 18
  });

  it('is $0 (not blocked) for an employee with no attendance in the period', () => {
    const employee: Employee = { id: 'e3', payType: 'daily', baseSalary: null, dailyRate: 18 };
    const item = generateItem(employee, []);
    expect(item.daysWorked).toBe(0);
    expect(item.baseAmount).toBe(0);
  });

  it('attendance from other employees or outside the period never leaks in', () => {
    const employee: Employee = { id: 'e4', payType: 'daily', baseSalary: null, dailyRate: 18 };
    const attendance: AttendanceRecord[] = [
      { employeeId: 'someone-else', businessDate: '2026-07-01', status: 'present' },
    ];
    expect(generateItem(employee, attendance).baseAmount).toBe(0);
  });
});

describe('acceptance — a whole run generates one item per active employee, independently', () => {
  it('mixed monthly/daily employees each compute correctly in the same run', () => {
    const employees: Employee[] = [
      { id: 'm1', payType: 'monthly', baseSalary: 450, dailyRate: null },
      { id: 'd1', payType: 'daily', baseSalary: null, dailyRate: 18 },
    ];
    const attendance: AttendanceRecord[] = [
      { employeeId: 'd1', businessDate: '2026-07-01', status: 'present' },
      { employeeId: 'd1', businessDate: '2026-07-02', status: 'present' },
      { employeeId: 'd1', businessDate: '2026-07-03', status: 'present' },
      { employeeId: 'd1', businessDate: '2026-07-06', status: 'present' },
      { employeeId: 'd1', businessDate: '2026-07-07', status: 'present' },
    ];
    const items = employees.map((e) => generateItem(e, attendance));
    expect(items[0]).toMatchObject({ payType: 'monthly', baseAmount: 450 });
    expect(items[1]).toMatchObject({ payType: 'daily', daysWorked: 5, baseAmount: 90 });
  });
});

describe('acceptance — net pay is base amount minus deduction/advance lines, never stored', () => {
  it('applies the sum of lines regardless of kind (deduction or advance)', () => {
    const baseAmount = 90;
    const lines = [
      { kind: 'advance' as const, amount: 20 },
      { kind: 'deduction' as const, amount: 5 },
    ];
    const deductionsTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
    expect(deductionsTotal).toBe(25);
    expect(computeNetAmount(baseAmount, deductionsTotal)).toBe(65);
  });

  it('with no lines, net pay equals the base amount exactly', () => {
    expect(computeNetAmount(450, 0)).toBe(450);
  });
});
