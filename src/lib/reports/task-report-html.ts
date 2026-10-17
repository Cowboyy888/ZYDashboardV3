/**
 * Branded Team Tasks report — pure, no DOM / no server deps.
 *
 * Same visual template as inquiry-report-html.ts (red/white letterhead, a
 * red section bar, a bordered table, a red footer) so every report in this
 * app looks like it came from the same place. Rendered to a real PDF
 * server-side by pdf.ts (see /api/export/tasks/pdf) and opened inline.
 */
import type { TaskRow } from '@/lib/db/types';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, summarizeTasks } from '@/lib/domain/tasks';
import { KHMER_FONT_FACE_CSS } from './fonts/noto-sans-khmer';

type ColumnKind = 'text' | 'num';

interface ReportColumn {
  key: string;
  header: string; // bilingual "English 中文"
  kind: ColumnKind;
}

/** Single source of truth for report columns. */
export const TASK_REPORT_COLUMNS: ReportColumn[] = [
  { key: 'no', header: 'No. 编号', kind: 'num' },
  { key: 'date', header: 'Date 日期', kind: 'text' },
  { key: 'employee', header: 'Employee 员工', kind: 'text' },
  { key: 'department', header: 'Department 部门', kind: 'text' },
  { key: 'category', header: 'Category 分类', kind: 'text' },
  { key: 'title', header: 'Title 标题', kind: 'text' },
  { key: 'description', header: 'Description 描述', kind: 'text' },
  { key: 'priority', header: 'Priority 优先级', kind: 'text' },
  { key: 'time', header: 'Planned time 计划时间', kind: 'text' },
  { key: 'customer', header: 'Customer 客户', kind: 'text' },
  { key: 'location', header: 'Location 地点', kind: 'text' },
  { key: 'status', header: 'Status 状态', kind: 'text' },
  { key: 'result', header: 'Result 结果', kind: 'text' },
  { key: 'notes', header: 'Notes 备注', kind: 'text' },
];

export type TaskReportRow = Record<string, string | number | null>;

export interface TaskReportData {
  generatedOn: string; // dd/mm/yyyy
  businessDate: string; // the viewed date, YYYY-MM-DD
  rows: TaskReportRow[];
  tasks: Array<{ businessDate: string; status: TaskRow['status'] }>;
}

export interface TaskReportResolvers {
  employeeName: (id: string) => string;
  departmentName: (id: string) => string;
  categoryName: (id: string | null) => string;
  customerName: (id: string | null) => string;
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return '';
  const trim = (v: string) => v.slice(0, 5);
  if (start && end) return `${trim(start)}–${trim(end)}`;
  return trim((start ?? end)!);
}

/** Map a DB task row to a display report row. */
export function toTaskReportRow(
  t: TaskRow,
  no: number,
  r: TaskReportResolvers,
  locale: 'en' | 'zh' = 'en',
): TaskReportRow {
  return {
    no,
    date: t.business_date,
    employee: r.employeeName(t.employee_id),
    department: r.departmentName(t.department_id),
    category: r.categoryName(t.category_id),
    title: t.title,
    description: t.description ?? '',
    priority: TASK_PRIORITY_LABELS[t.priority][locale],
    time: formatTimeRange(t.planned_start, t.planned_end),
    customer: r.customerName(t.customer_id),
    location: t.location ?? '',
    status: TASK_STATUS_LABELS[t.status][locale],
    result: t.result ?? '',
    notes: t.notes ?? '',
  };
}

export function cellText(value: string | number | null): string {
  const s = value == null ? '' : String(value);
  return s.length ? s : '—';
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const RED = '#e31e24';
const BANNER = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

/**
 * A self-contained, print-optimized HTML document for the Team Tasks
 * report — same letterhead/table/footer template as the inquiry report.
 */
export function buildTaskReportHtml(data: TaskReportData): string {
  const counts = summarizeTasks(
    data.tasks.map((t) => ({ employeeId: '', businessDate: t.businessDate, status: t.status })),
    data.businessDate,
  );

  const metaRight: Array<[string, string]> = [
    ['Generated:', data.generatedOn],
    ['Date:', data.businessDate],
    ['Tasks:', String(counts.total)],
  ];

  const totals: Array<[string, string, boolean]> = [
    ['Planned 计划中:', String(counts.planned), false],
    ['In progress 进行中:', String(counts.inProgress), false],
    ['Completed 已完成:', String(counts.completed), false],
    ['Overdue 逾期:', String(counts.overdue), false],
    ['COMPLETION RATE 完成率:', `${(counts.completionRate * 100).toFixed(0)}%`, true],
  ];

  const thead = TASK_REPORT_COLUMNS.map(
    (c) => `<th class="${c.kind === 'text' ? 'l' : 'r'}">${esc(c.header)}</th>`,
  ).join('');

  const tbody =
    data.rows.length === 0
      ? `<tr><td class="empty" colspan="${TASK_REPORT_COLUMNS.length}">No tasks for this selection 暂无任务</td></tr>`
      : data.rows
          .map(
            (row) =>
              `<tr>${TASK_REPORT_COLUMNS.map((c) => {
                const align = c.kind === 'text' ? 'l' : 'r';
                return `<td class="${align}">${esc(cellText(row[c.key] ?? null))}</td>`;
              }).join('')}</tr>`,
          )
          .join('');

  const metaRightHtml = metaRight
    .map(([l, v]) => `<tr><td class="ml">${esc(l)}</td><td class="mv">${esc(v)}</td></tr>`)
    .join('');

  const totalsHtml = totals
    .map(
      ([l, v, hi]) =>
        `<tr class="${hi ? 'hi' : ''}"><td class="tl">${esc(l)}</td><td class="tv">${esc(v)}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · Team Tasks Report</title>
<style>
${KHMER_FONT_FACE_CSS}
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Noto Sans Khmer", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: ${INK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 20px;
  }
  .letterhead { display: flex; align-items: center; gap: 10px; }
  .logo { height: 42px; width: auto; }
  .brand { font-size: 22px; font-weight: 700; letter-spacing: .3px; }
  .brand-zh { font-size: 12px; font-weight: 700; color: ${RED}; margin-top: 1px; }
  .sub { font-size: 9px; color: ${MUTED}; margin-top: 2px; }
  .bar {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 8px; margin: 14px 0 12px; font-size: 13px; letter-spacing: .3px;
  }
  .meta { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
  .meta-l { font-size: 10px; }
  .meta-l .lbl { font-size: 9px; font-weight: 700; color: ${RED}; }
  .meta-l .val { font-size: 12px; font-weight: 700; }
  .meta-l .small { font-size: 9px; color: ${MUTED}; margin-top: 2px; }
  .meta-r td { font-size: 9px; padding: 1px 0; }
  .meta-r .ml { font-weight: 700; text-align: right; padding-right: 8px; }
  .meta-r .mv { text-align: right; }
  table.data { width: 100%; border-collapse: collapse; font-size: 8.5px; }
  table.data th, table.data td { border: 1px solid #bfbfbf; padding: 4px 5px; }
  table.data thead th { background: ${RED}; color: #fff; font-weight: 700; text-align: center; }
  table.data th.l, table.data td.l { text-align: left; }
  table.data th.r, table.data td.r { text-align: right; }
  table.data tbody tr:nth-child(even) { background: #fafafa; }
  table.data td.empty { text-align: center; color: ${MUTED}; font-style: italic; padding: 14px; }
  .totals { margin-top: 10px; display: flex; justify-content: flex-end; }
  .totals table { border-collapse: collapse; font-size: 10px; }
  .totals .tl { text-align: right; font-weight: 700; padding: 3px 10px; }
  .totals .tv { text-align: right; font-weight: 700; padding: 3px 10px; border: 1px solid #bfbfbf; min-width: 90px; }
  .totals tr.hi .tl, .totals tr.hi .tv { background: ${BANNER}; color: ${RED}; }
  .footer {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 6px; margin-top: 16px; font-size: 9px;
  }
  @page { size: A4 landscape; margin: 10mm; }
</style>
</head>
<body>
  <div class="letterhead">
    <img src="/brand/zysteel-logo.png" alt="ZY Steel 中粤铁网" class="logo" />
    <div>
      <div class="brand">ZY STEEL</div>
      <div class="brand-zh">中粤铁网</div>
      <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer</div>
      <div class="sub">Phnom Penh, Kingdom of Cambodia</div>
    </div>
  </div>

  <div class="bar">TEAM TASKS REPORT · 团队任务报告</div>

  <div class="meta">
    <div class="meta-l">
      <div class="lbl">REPORT:</div>
      <div class="val">Team Tasks 团队任务</div>
      <div class="small">Includes still-open tasks carried over from earlier dates 含往期未完成任务</div>
    </div>
    <table class="meta-r">${metaRightHtml}</table>
  </div>

  <table class="data">
    <thead><tr>${thead}</tr></thead>
    <tbody>${tbody}</tbody>
  </table>

  <div class="totals"><table>${totalsHtml}</table></div>

  <div class="footer">ZY STEEL 中粤铁网 · Phnom Penh, Cambodia · Thank you for your business</div>
</body>
</html>`;
}
