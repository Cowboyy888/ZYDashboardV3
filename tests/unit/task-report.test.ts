import { describe, it, expect } from 'vitest';
import {
  TASK_REPORT_COLUMNS,
  toTaskReportRow,
  cellText,
  buildTaskReportHtml,
  type TaskReportResolvers,
} from '@/lib/reports/task-report-html';
import type { TaskRow } from '@/lib/db/types';

const resolvers: TaskReportResolvers = {
  employeeName: (id) => (id === 'emp1' ? 'Sok Dara' : id),
  departmentName: (id) => (id === 'dept1' ? 'Marketing' : id),
  categoryName: (id) => (id === 'cat1' ? 'Visit customer' : ''),
  customerName: (id) => (id === 'cust1' ? 'Galleria Tile' : ''),
};

const task = (o: Partial<TaskRow> = {}): TaskRow =>
  ({
    id: 't1',
    employee_id: 'emp1',
    department_id: 'dept1',
    category_id: 'cat1',
    business_date: '2026-10-16',
    title: 'Visit construction site',
    description: 'Discuss the Q4 reinforcement mesh order and site measurements',
    priority: 'high',
    planned_start: '09:00:00',
    planned_end: '11:00:00',
    status: 'planned',
    result: null,
    customer_id: 'cust1',
    location: 'Phnom Penh',
    notes: null,
    attachment_path: null,
    created_by: null,
    assigned_by: null,
    created_at: '',
    updated_at: '',
    ...o,
  }) as TaskRow;

describe('cellText', () => {
  it('renders an em dash for null/empty, the value otherwise', () => {
    expect(cellText(null)).toBe('—');
    expect(cellText('')).toBe('—');
    expect(cellText('Marketing')).toBe('Marketing');
    expect(cellText(3)).toBe('3');
  });
});

describe('toTaskReportRow', () => {
  it('maps a DB task to display values, resolving ids to names', () => {
    const row = toTaskReportRow(task(), 1, resolvers, 'en');
    expect(row.no).toBe(1);
    expect(row.date).toBe('2026-10-16');
    expect(row.employee).toBe('Sok Dara');
    expect(row.department).toBe('Marketing');
    expect(row.category).toBe('Visit customer');
    expect(row.title).toBe('Visit construction site');
    expect(row.description).toBe('Discuss the Q4 reinforcement mesh order and site measurements');
    expect(row.priority).toBe('High');
    expect(row.time).toBe('09:00–11:00');
    expect(row.customer).toBe('Galleria Tile');
    expect(row.location).toBe('Phnom Penh');
    expect(row.status).toBe('Planned');
  });

  it('leaves description blank rather than null when none was set', () => {
    const row = toTaskReportRow(task({ description: null }), 1, resolvers, 'en');
    expect(row.description).toBe('');
  });

  it('formats a single planned time (no end) without a dash', () => {
    const row = toTaskReportRow(task({ planned_end: null }), 1, resolvers, 'en');
    expect(row.time).toBe('09:00');
  });

  it('leaves time blank when neither start nor end is set', () => {
    const row = toTaskReportRow(
      task({ planned_start: null, planned_end: null }),
      1,
      resolvers,
      'en',
    );
    expect(row.time).toBe('');
  });

  it('has a stable column set including every field toTaskReportRow produces', () => {
    const keys = TASK_REPORT_COLUMNS.map((c) => c.key);
    const row = toTaskReportRow(task(), 1, resolvers, 'en');
    for (const key of Object.keys(row)) {
      expect(keys).toContain(key);
    }
    expect(new Set(keys).size).toBe(keys.length); // unique
  });
});

describe('buildTaskReportHtml', () => {
  it('produces a branded, self-contained HTML document with the data', () => {
    const html = buildTaskReportHtml({
      generatedOn: '17/10/2026',
      businessDate: '2026-10-17',
      rows: [toTaskReportRow(task(), 1, resolvers, 'en')],
      tasks: [{ businessDate: '2026-10-16', status: 'planned' }],
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('ZY STEEL');
    expect(html).toContain('中粤铁网');
    expect(html).toContain('TEAM TASKS REPORT');
    expect(html).toContain('print-color-adjust: exact');
    expect(html).toContain('Title 标题'); // column header
    expect(html).toContain('Visit construction site'); // the title value
    expect(html).toContain('Description 描述'); // column header
    expect(html).toContain('Discuss the Q4 reinforcement mesh order and site measurements');
    expect(html).toContain('17/10/2026');
    expect(html).toContain('Thank you for your business');
  });

  it('counts a task from an earlier date as overdue in the totals', () => {
    const html = buildTaskReportHtml({
      generatedOn: '17/10/2026',
      businessDate: '2026-10-17',
      rows: [],
      tasks: [
        { businessDate: '2026-10-16', status: 'planned' }, // overdue
        { businessDate: '2026-10-17', status: 'planned' }, // not overdue (today)
        { businessDate: '2026-10-15', status: 'completed' }, // resolved, not overdue
      ],
    });
    expect(html).toContain('Overdue 逾期:');
    // 2 planned, 1 of which (2026-10-16) is before businessDate and unresolved.
    expect(html).toMatch(/Overdue 逾期:<\/td><td class="tv">1/);
  });

  it('shows an empty-state row when there are no tasks', () => {
    const html = buildTaskReportHtml({
      generatedOn: '17/10/2026',
      businessDate: '2026-10-17',
      rows: [],
      tasks: [],
    });
    expect(html).toContain('No tasks for this selection');
  });

  it('escapes HTML-special characters in task data', () => {
    const html = buildTaskReportHtml({
      generatedOn: '17/10/2026',
      businessDate: '2026-10-17',
      rows: [toTaskReportRow(task({ title: 'A & B <site>' }), 1, resolvers, 'en')],
      tasks: [{ businessDate: '2026-10-17', status: 'planned' }],
    });
    expect(html).toContain('A &amp; B &lt;site&gt;');
    expect(html).not.toContain('A & B <site>');
  });
});
