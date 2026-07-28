import { describe, it, expect } from 'vitest';
import {
  buildGroupedAttendanceReport,
  toSlashDate,
  type ReportGroup,
  type ReportEmployee,
  type ReportAttendance,
} from '@/lib/domain/attendance-report';

const GROUPS: ReportGroup[] = [
  { id: 'g1', name: '老板助理' },
  { id: 'g2', name: '工厂主管' },
  { id: 'g3', name: '机器机长' },
  { id: 'g4', name: '焊网机员工' },
  { id: 'g5', name: '调直机员工' },
  { id: 'g6', name: '拔丝机员工' },
  { id: 'g7', name: '行车员' },
  { id: 'g8', name: '采买配件房' },
  { id: 'g9', name: '安保' },
];

let seq = 100;
function present(groupId: string, count: number): ReportEmployee[] {
  return Array.from({ length: count }, () => {
    seq += 1;
    return {
      id: `e${seq}`,
      groupId,
      displayName: `emp${seq}`,
      employeeNumber: String(seq),
      jobTitle: '员工',
      label: null,
    };
  });
}

/**
 * Reconstruct the exact scenario from the spec:
 * 9 groups, all present except 焊网机员工 which has 11 scheduled / 10 present with
 * one person (thol savarin, #7, 备用, 焊网机机长) on leave.
 */
function buildScenario() {
  const employees: ReportEmployee[] = [
    ...present('g1', 2),
    ...present('g2', 3),
    ...present('g3', 6),
    ...present('g4', 10),
    ...present('g5', 4),
    ...present('g6', 6),
    ...present('g7', 3),
    ...present('g8', 1),
    ...present('g9', 1),
  ];
  const leaver: ReportEmployee = {
    id: 'leaver',
    groupId: 'g4',
    displayName: 'thol savarin',
    employeeNumber: '7',
    jobTitle: '焊网机机长',
    label: '备用',
  };
  employees.push(leaver);

  const records: ReportAttendance[] = employees.map((e) =>
    e.id === 'leaver'
      ? { employeeId: e.id, status: 'leave' as const }
      : { employeeId: e.id, status: 'present' as const },
  );
  return { employees, records };
}

describe('grouped attendance report — exact format', () => {
  it('reproduces the afternoon report exactly', () => {
    const { employees, records } = buildScenario();
    const report = buildGroupedAttendanceReport({
      date: '2026-07-24',
      shift: 'afternoon',
      groups: GROUPS,
      employees,
      records,
    });

    const expected = [
      '2026/07/24',
      '中粤钢铁下午出勤记录',
      '老板助理 2/2',
      '工厂主管 3/3',
      '机器机长 6/6',
      '焊网机员工 10/11',
      '调直机员工 4/4',
      '拔丝机员工 6/6',
      '行车员 3/3',
      '采买配件房 1/1',
      '安保 1/1',
      '请假 1人',
      'thol savarin 7号（备用）焊网机机长',
      '总计 37人，实到 36人',
    ].join('\n');

    expect(report.text).toBe(expected);
  });

  it('uses the morning title but the same body rules', () => {
    const { employees, records } = buildScenario();
    const report = buildGroupedAttendanceReport({
      date: '2026-07-24',
      shift: 'morning',
      groups: GROUPS,
      employees,
      records,
    });
    expect(report.text.split('\n')[1]).toBe('中粤钢铁上午出勤记录');
  });
});

describe('grouped attendance report — group totals', () => {
  it('computes actual present / scheduled per group in configured order', () => {
    const { employees, records } = buildScenario();
    const report = buildGroupedAttendanceReport({
      date: '2026-07-24',
      shift: 'afternoon',
      groups: GROUPS,
      employees,
      records,
    });
    expect(report.groupLines.map((g) => g.name)).toEqual(GROUPS.map((g) => g.name)); // order
    const mesh = report.groupLines.find((g) => g.name === '焊网机员工')!;
    expect(mesh.scheduled).toBe(11);
    expect(mesh.actual).toBe(10);
    // Every other group is fully present.
    for (const gl of report.groupLines.filter((g) => g.name !== '焊网机员工')) {
      expect(gl.actual).toBe(gl.scheduled);
    }
  });

  it('counts Late as actual present but Leave/Absent/Unmarked as not', () => {
    const groups: ReportGroup[] = [{ id: 'g', name: '组' }];
    const employees: ReportEmployee[] = [
      { id: 'a', groupId: 'g', displayName: 'A', employeeNumber: '1', jobTitle: null, label: null },
      { id: 'b', groupId: 'g', displayName: 'B', employeeNumber: '2', jobTitle: null, label: null },
      { id: 'c', groupId: 'g', displayName: 'C', employeeNumber: '3', jobTitle: null, label: null },
      { id: 'd', groupId: 'g', displayName: 'D', employeeNumber: '4', jobTitle: null, label: null },
    ];
    const records: ReportAttendance[] = [
      { employeeId: 'a', status: 'present' },
      { employeeId: 'b', status: 'late' }, // counts
      { employeeId: 'c', status: 'absent' }, // does not
      // d unmarked -> does not
    ];
    const report = buildGroupedAttendanceReport({
      date: '2026-07-24',
      shift: 'morning',
      groups,
      employees,
      records,
    });
    expect(report.groupLines[0]).toMatchObject({ actual: 2, scheduled: 4 });
    expect(report.actualPresent).toBe(2);
  });
});

describe('grouped attendance report — leave details & totals', () => {
  it('lists only nonzero exception sections with the employee detail line', () => {
    const { employees, records } = buildScenario();
    const report = buildGroupedAttendanceReport({
      date: '2026-07-24',
      shift: 'afternoon',
      groups: GROUPS,
      employees,
      records,
    });
    expect(report.exceptions).toHaveLength(1);
    const leave = report.exceptions[0]!;
    expect(leave.key).toBe('leave');
    expect(leave.count).toBe(1);
    expect(report.text).toContain('请假 1人');
    expect(report.text).toContain('thol savarin 7号（备用）焊网机机长');
    // No spurious sections
    expect(report.text).not.toContain('缺勤');
    expect(report.text).not.toContain('未打卡');
  });

  it('reports total active and actual-present counts', () => {
    const { employees, records } = buildScenario();
    const report = buildGroupedAttendanceReport({
      date: '2026-07-24',
      shift: 'afternoon',
      groups: GROUPS,
      employees,
      records,
    });
    expect(report.totalActive).toBe(37);
    expect(report.actualPresent).toBe(36);
    expect(report.text).toContain('总计 37人，实到 36人');
  });

  it('orders exception sections 请假 · 缺勤 · 迟到 · 未打卡 and omits empty ones', () => {
    const groups: ReportGroup[] = [{ id: 'g', name: '组' }];
    const mk = (id: string, n: string): ReportEmployee => ({
      id,
      groupId: 'g',
      displayName: id.toUpperCase(),
      employeeNumber: n,
      jobTitle: '工',
      label: null,
    });
    const employees = [mk('a', '1'), mk('b', '2'), mk('c', '3')];
    const records: ReportAttendance[] = [
      { employeeId: 'a', status: 'leave' },
      { employeeId: 'b', status: 'absent' },
      // c unmarked
    ];
    const report = buildGroupedAttendanceReport({
      date: '2026-07-24',
      shift: 'morning',
      groups,
      employees,
      records,
    });
    expect(report.exceptions.map((e) => e.key)).toEqual(['leave', 'absent', 'unmarked']);
  });
});

describe('toSlashDate', () => {
  it('formats YYYY-MM-DD as YYYY/MM/DD', () => {
    expect(toSlashDate('2026-07-24')).toBe('2026/07/24');
    expect(toSlashDate('2026-07-24T05:00:00Z')).toBe('2026/07/24');
  });
});
