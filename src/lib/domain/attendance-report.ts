/**
 * Grouped attendance report (中粤钢铁 出勤记录).
 *
 * Produces the exact Chinese Telegram format from a shift's attendance records:
 *
 *   2026/07/24
 *   中粤钢铁下午出勤记录
 *   老板助理 2/2
 *   ...
 *   焊网机员工 10/11
 *   ...
 *   请假 1人
 *   thol savarin 焊网机机长
 *   总计 37人，实到 36人
 *
 * Rules:
 *  - Group line: `{group} {actual present}/{scheduled active}` for every active
 *    group in configured order (including zero actual present).
 *  - "实到" (actual present) = Present + Late. Leave/Absent/Unmarked do not count.
 *  - Scheduled = active employees assigned to that group on the date.
 *  - Below groups, only NON-ZERO exception sections in this order:
 *    请假 (leave) · 缺勤 (absent) · 迟到 (late) · 未打卡 (unmarked), each sorted
 *    by group order then display name.
 *  - Each exception employee line: `{display name} {job title}`.
 *  - Footer: `总计 {total active}人，实到 {total actual present}人`.
 *
 * Pure — no I/O — so the exact output is unit-tested.
 */

import type { AttendanceStatus, Shift } from './attendance';

export interface ReportGroup {
  id: string;
  name: string;
}

export interface ReportEmployee {
  id: string;
  groupId: string | null;
  displayName: string;
  jobTitle: string | null;
  label: string | null;
}

export interface ReportAttendance {
  employeeId: string;
  status: Exclude<AttendanceStatus, 'unmarked'>;
}

type ExceptionKey = 'leave' | 'absent' | 'late' | 'unmarked';

const EXCEPTION_ORDER: ExceptionKey[] = ['leave', 'absent', 'late', 'unmarked'];
const EXCEPTION_LABEL: Record<ExceptionKey, string> = {
  leave: '请假',
  absent: '缺勤',
  late: '迟到',
  unmarked: '未打卡',
};

export const REPORT_TITLE: Record<Shift, string> = {
  morning: '中粤钢铁上午出勤记录',
  afternoon: '中粤钢铁下午出勤记录',
};

export interface GroupLine {
  groupId: string;
  name: string;
  actual: number;
  scheduled: number;
}

export interface ExceptionSection {
  key: ExceptionKey;
  label: string;
  count: number;
  employees: ReportEmployee[];
}

export interface GroupedAttendanceReport {
  text: string;
  title: string;
  date: string; // YYYY/MM/DD
  totalActive: number;
  actualPresent: number; // present + late
  groupLines: GroupLine[];
  exceptions: ExceptionSection[];
}

/** `YYYY-MM-DD` (or ISO datetime) -> `YYYY/MM/DD`. */
export function toSlashDate(businessDate: string): string {
  return businessDate.slice(0, 10).replace(/-/g, '/');
}

function isActualPresent(status: AttendanceStatus): boolean {
  return status === 'present' || status === 'late';
}

function employeeLine(e: ReportEmployee): string {
  const title = e.jobTitle ?? '';
  return `${e.displayName} ${title}`.trimEnd();
}

/**
 * Build the grouped attendance report for one shift + business date.
 * `employees` must already be the ACTIVE employees for that date.
 */
export function buildGroupedAttendanceReport(params: {
  date: string; // YYYY-MM-DD business date
  shift: Shift;
  groups: ReportGroup[]; // active groups in display order
  employees: ReportEmployee[]; // active employees
  records: ReportAttendance[];
}): GroupedAttendanceReport {
  const { date, shift, groups, employees, records } = params;

  // Resolve each active employee's status (record status, or `unmarked`).
  const statusByEmployee = new Map<string, AttendanceStatus>();
  for (const r of records) statusByEmployee.set(r.employeeId, r.status);
  const resolvedStatus = (id: string): AttendanceStatus => statusByEmployee.get(id) ?? 'unmarked';

  // Group lines in configured order.
  const groupLines: GroupLine[] = groups.map((g) => {
    const members = employees.filter((e) => e.groupId === g.id);
    const actual = members.filter((m) => isActualPresent(resolvedStatus(m.id))).length;
    return { groupId: g.id, name: g.name, actual, scheduled: members.length };
  });

  // Exception sections — deterministic ordering by group order then name.
  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
  const byGroupThenName = (a: ReportEmployee, b: ReportEmployee) => {
    const ga = a.groupId ? (groupOrder.get(a.groupId) ?? 999) : 999;
    const gb = b.groupId ? (groupOrder.get(b.groupId) ?? 999) : 999;
    if (ga !== gb) return ga - gb;
    return a.displayName.localeCompare(b.displayName);
  };

  const exceptions: ExceptionSection[] = EXCEPTION_ORDER.map((key) => {
    const members = employees.filter((e) => resolvedStatus(e.id) === key).sort(byGroupThenName);
    return { key, label: EXCEPTION_LABEL[key], count: members.length, employees: members };
  }).filter((s) => s.count > 0);

  const totalActive = employees.length;
  const actualPresent = employees.filter((e) => isActualPresent(resolvedStatus(e.id))).length;
  const title = REPORT_TITLE[shift];
  const slashDate = toSlashDate(date);

  // Assemble text (no blank lines between sections).
  const lines: string[] = [slashDate, title];
  for (const gl of groupLines) lines.push(`${gl.name} ${gl.actual}/${gl.scheduled}`);
  for (const sec of exceptions) {
    lines.push(`${sec.label} ${sec.count}人`);
    for (const e of sec.employees) lines.push(employeeLine(e));
  }
  lines.push(`总计 ${totalActive}人，实到 ${actualPresent}人`);

  return {
    text: lines.join('\n'),
    title,
    date: slashDate,
    totalActive,
    actualPresent,
    groupLines,
    exceptions,
  };
}
