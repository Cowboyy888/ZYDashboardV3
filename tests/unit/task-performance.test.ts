import { describe, it, expect } from 'vitest';
import {
  buildEmployeePerformanceRows,
  buildTeamOverview,
  buildDailyBreakdown,
  type EmployeeLike,
  type TaskRowLike,
  type MetricRowLike,
} from '@/lib/domain/task-performance';

const TODAY = '2026-07-24';
const employees: EmployeeLike[] = [
  {
    id: 'e1',
    employee_code: 'ZY-0001',
    display_name: 'Dara',
    name_english: null,
    name_chinese: null,
  },
  {
    id: 'e2',
    employee_code: 'ZY-0002',
    display_name: null,
    name_english: 'Sophea',
    name_chinese: null,
  },
];

describe('buildEmployeePerformanceRows', () => {
  it('sums metrics per employee and resolves display names via the fallback chain', () => {
    const tasks: TaskRowLike[] = [
      {
        id: 't1',
        employeeId: 'e1',
        departmentId: 'd1',
        title: 'Visit site',
        businessDate: TODAY,
        status: 'completed',
      },
      {
        id: 't2',
        employeeId: 'e1',
        departmentId: 'd1',
        title: 'Follow up',
        businessDate: TODAY,
        status: 'planned',
      },
    ];
    const metrics: MetricRowLike[] = [
      { employeeId: 'e1', businessDate: TODAY, metricKey: 'visits', value: 3 },
      { employeeId: 'e1', businessDate: '2026-07-23', metricKey: 'visits', value: 2 },
      { employeeId: 'e2', businessDate: TODAY, metricKey: 'leads', value: 5 },
    ];
    const rows = buildEmployeePerformanceRows(tasks, metrics, employees, TODAY);
    expect(rows).toHaveLength(2);

    const e1 = rows.find((r) => r.employeeId === 'e1')!;
    expect(e1.employeeName).toBe('Dara');
    expect(e1.counts.total).toBe(2);
    expect(e1.counts.completed).toBe(1);
    expect(e1.metrics.visits).toBe(5); // summed across both dates

    const e2 = rows.find((r) => r.employeeId === 'e2')!;
    expect(e2.employeeName).toBe('Sophea');
    expect(e2.counts.total).toBe(0); // no tasks, only a metric entry
    expect(e2.metrics.leads).toBe(5);
  });

  it('an employee with only a metric entry (no tasks) still appears', () => {
    const rows = buildEmployeePerformanceRows(
      [],
      [{ employeeId: 'e2', businessDate: TODAY, metricKey: 'leads', value: 1 }],
      employees,
      TODAY,
    );
    expect(rows.map((r) => r.employeeId)).toEqual(['e2']);
  });
});

describe('buildTeamOverview', () => {
  it('sums both task counts and metrics across every employee row', () => {
    const rows = buildEmployeePerformanceRows(
      [
        {
          id: 't1',
          employeeId: 'e1',
          departmentId: 'd1',
          title: 'A',
          businessDate: TODAY,
          status: 'completed',
        },
        {
          id: 't2',
          employeeId: 'e2',
          departmentId: 'd1',
          title: 'B',
          businessDate: TODAY,
          status: 'completed',
        },
      ],
      [
        { employeeId: 'e1', businessDate: TODAY, metricKey: 'visits', value: 3 },
        { employeeId: 'e2', businessDate: TODAY, metricKey: 'visits', value: 4 },
      ],
      employees,
      TODAY,
    );
    const overview = buildTeamOverview(rows);
    expect(overview.totalEmployees).toBe(2);
    expect(overview.counts.completed).toBe(2);
    expect(overview.metrics.visits).toBe(7);
  });
});

describe('buildDailyBreakdown', () => {
  it('buckets tasks and metrics per date, in the given date order', () => {
    const tasks: TaskRowLike[] = [
      {
        id: 't1',
        employeeId: 'e1',
        departmentId: 'd1',
        title: 'Mon task',
        businessDate: '2026-07-20',
        status: 'completed',
      },
      {
        id: 't2',
        employeeId: 'e1',
        departmentId: 'd1',
        title: 'Tue task',
        businessDate: '2026-07-21',
        status: 'planned',
      },
    ];
    const metrics: MetricRowLike[] = [
      { employeeId: 'e1', businessDate: '2026-07-20', metricKey: 'visits', value: 2 },
    ];
    const days = buildDailyBreakdown(tasks, metrics, ['2026-07-20', '2026-07-21', '2026-07-22']);
    expect(days.map((d) => d.businessDate)).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
    expect(days[0]!.tasks).toHaveLength(1);
    expect(days[0]!.metrics.visits).toBe(2);
    expect(days[1]!.tasks).toHaveLength(1);
    expect(days[2]!.tasks).toHaveLength(0);
    expect(days[2]!.metrics).toEqual({});
  });
});
