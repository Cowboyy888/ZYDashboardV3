import { describe, it, expect } from 'vitest';
import {
  summarizeShift,
  findUnmarked,
  isShiftComplete,
  attendanceRate,
  type AttendanceRecord,
} from '@/lib/domain/attendance';

const DATE = '2026-07-24';
const employees = ['e1', 'e2', 'e3', 'e4', 'e5'];

describe('acceptance #7 — attendance report aggregation', () => {
  it('rolls up morning totals and lists exceptions, treating missing as unmarked', () => {
    const records: AttendanceRecord[] = [
      { employeeId: 'e1', businessDate: DATE, shift: 'morning', status: 'present' },
      { employeeId: 'e2', businessDate: DATE, shift: 'morning', status: 'late' },
      { employeeId: 'e3', businessDate: DATE, shift: 'morning', status: 'leave' },
      { employeeId: 'e4', businessDate: DATE, shift: 'morning', status: 'absent' },
      // e5 has no record -> unmarked
    ];
    const s = summarizeShift(employees, records, DATE, 'morning');
    expect(s.totalActive).toBe(5);
    expect(s.present).toBe(1);
    expect(s.late).toBe(1);
    expect(s.leave).toBe(1);
    expect(s.absent).toBe(1);
    expect(s.unmarked).toBe(1);
    // present + late + leave + absent + unmarked == totalActive
    expect(s.present + s.late + s.leave + s.absent + s.unmarked).toBe(s.totalActive);
    // exceptions are everyone not plainly present
    expect(s.exceptions.map((e) => e.employeeId).sort()).toEqual(['e2', 'e3', 'e4', 'e5']);
  });

  it('separates morning and afternoon shifts', () => {
    const records: AttendanceRecord[] = [
      { employeeId: 'e1', businessDate: DATE, shift: 'morning', status: 'present' },
      { employeeId: 'e1', businessDate: DATE, shift: 'afternoon', status: 'absent' },
    ];
    expect(summarizeShift(['e1'], records, DATE, 'morning').present).toBe(1);
    expect(summarizeShift(['e1'], records, DATE, 'afternoon').absent).toBe(1);
  });

  it('detects unmarked employees before a report is sent', () => {
    const records: AttendanceRecord[] = [
      { employeeId: 'e1', businessDate: DATE, shift: 'morning', status: 'present' },
    ];
    expect(findUnmarked(employees, records, DATE, 'morning').sort()).toEqual([
      'e2',
      'e3',
      'e4',
      'e5',
    ]);
    expect(isShiftComplete(employees, records, DATE, 'morning')).toBe(false);

    const full: AttendanceRecord[] = employees.map((employeeId) => ({
      employeeId,
      businessDate: DATE,
      shift: 'morning',
      status: 'present' as const,
    }));
    expect(isShiftComplete(employees, full, DATE, 'morning')).toBe(true);
  });
});

describe('month-to-date attendance rate', () => {
  it('counts present+late as attended, excludes leave from denominator', () => {
    const records: AttendanceRecord[] = [
      { employeeId: 'e1', businessDate: '2026-07-01', shift: 'morning', status: 'present' },
      { employeeId: 'e1', businessDate: '2026-07-02', shift: 'morning', status: 'late' },
      { employeeId: 'e1', businessDate: '2026-07-03', shift: 'morning', status: 'absent' },
      { employeeId: 'e1', businessDate: '2026-07-04', shift: 'morning', status: 'leave' }, // excluded
    ];
    // attended 2 of 3 non-leave records
    expect(attendanceRate(records)).toBeCloseTo(2 / 3, 5);
  });

  it('returns 0 with no data', () => {
    expect(attendanceRate([])).toBe(0);
  });
});
