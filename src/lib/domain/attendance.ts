/**
 * Attendance domain logic.
 *
 * Two manual shifts per business day:
 *   - morning   (Admin completes ~07:30, report at 08:00)
 *   - afternoon (Admin completes ~12:30, report at 13:00)
 *
 * Exactly one record may exist per (employee, business_date, shift). Employees
 * with no record are treated as `unmarked` so reports always reconcile against
 * the full active headcount.
 */

export const SHIFTS = ['morning', 'afternoon'] as const;
export type Shift = (typeof SHIFTS)[number];

export const ATTENDANCE_STATUSES = ['present', 'late', 'leave', 'absent', 'unmarked'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const STATUS_LABELS: Record<AttendanceStatus, { en: string; zh: string }> = {
  present: { en: 'Present', zh: '出勤' },
  late: { en: 'Late', zh: '迟到' },
  leave: { en: 'Leave', zh: '请假' },
  absent: { en: 'Absent', zh: '缺勤' },
  unmarked: { en: 'Unmarked', zh: '未标记' },
};

export const SHIFT_LABELS: Record<Shift, { en: string; zh: string }> = {
  morning: { en: 'Morning', zh: '上午' },
  afternoon: { en: 'Afternoon', zh: '下午' },
};

export interface AttendanceRecord {
  employeeId: string;
  businessDate: string; // YYYY-MM-DD
  shift: Shift;
  status: Exclude<AttendanceStatus, 'unmarked'>;
}

export interface AttendanceException {
  employeeId: string;
  status: AttendanceStatus;
}

export interface ShiftSummary {
  businessDate: string;
  shift: Shift;
  totalActive: number;
  present: number;
  late: number;
  leave: number;
  absent: number;
  unmarked: number;
  /** Everyone who is not plainly "present" (late, leave, absent, unmarked). */
  exceptions: AttendanceException[];
}

/**
 * Resolve each active employee's status for a shift (record status, or
 * `unmarked` when no record exists) and roll up the totals.
 */
export function summarizeShift(
  activeEmployeeIds: string[],
  records: AttendanceRecord[],
  businessDate: string,
  shift: Shift,
): ShiftSummary {
  const byEmployee = new Map<string, AttendanceStatus>();
  for (const r of records) {
    if (r.businessDate === businessDate && r.shift === shift) {
      byEmployee.set(r.employeeId, r.status);
    }
  }

  const summary: ShiftSummary = {
    businessDate,
    shift,
    totalActive: activeEmployeeIds.length,
    present: 0,
    late: 0,
    leave: 0,
    absent: 0,
    unmarked: 0,
    exceptions: [],
  };

  for (const employeeId of activeEmployeeIds) {
    const status = byEmployee.get(employeeId) ?? 'unmarked';
    summary[status] += 1;
    if (status !== 'present') {
      summary.exceptions.push({ employeeId, status });
    }
  }

  return summary;
}

/** Active employees with no record (or an explicit `unmarked`) for the shift. */
export function findUnmarked(
  activeEmployeeIds: string[],
  records: AttendanceRecord[],
  businessDate: string,
  shift: Shift,
): string[] {
  const marked = new Set(
    records
      .filter((r) => r.businessDate === businessDate && r.shift === shift)
      .map((r) => r.employeeId),
  );
  return activeEmployeeIds.filter((id) => !marked.has(id));
}

/** True when every active employee has a record for the shift. */
export function isShiftComplete(
  activeEmployeeIds: string[],
  records: AttendanceRecord[],
  businessDate: string,
  shift: Shift,
): boolean {
  return findUnmarked(activeEmployeeIds, records, businessDate, shift).length === 0;
}

/**
 * Month-to-date attendance rate: present+late counted as "attended" over all
 * resolved (non-unmarked) records. Returns a 0..1 ratio (0 when no data).
 */
export function attendanceRate(records: AttendanceRecord[]): number {
  const resolved = records.filter((r) => r.status !== 'leave');
  if (resolved.length === 0) return 0;
  const attended = resolved.filter((r) => r.status === 'present' || r.status === 'late').length;
  return attended / resolved.length;
}
