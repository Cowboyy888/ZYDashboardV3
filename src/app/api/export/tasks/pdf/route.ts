import { requirePermission } from '@/lib/auth';
import {
  getEmployees,
  getTaskDepartments,
  getTaskCategories,
  getCustomers,
  getTasksForRange,
  getOpenTasksBefore,
} from '@/lib/db/queries';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import {
  buildTaskReportHtml,
  toTaskReportRow,
  type TaskReportResolvers,
  type TaskReportData,
} from '@/lib/reports/task-report-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/reports/pdf';
import { getLocale } from '@/lib/i18n/locale';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  await requirePermission('tasks:view');
  const locale = await getLocale();

  const params = new URL(request.url).searchParams;
  const dateParam = params.get('date') ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : businessDate();
  const department = params.get('department');
  const status = params.get('status');

  const [employees, departments, categories, customers, dayTasks, carriedOver] = await Promise.all([
    getEmployees(true),
    getTaskDepartments(true),
    getTaskCategories(true),
    getCustomers(true),
    getTasksForRange(date, date),
    date === businessDate() ? getOpenTasksBefore(date) : Promise.resolve([]),
  ]);
  let tasks = [...carriedOver, ...dayTasks];
  if (department && department !== 'all') {
    tasks = tasks.filter((t) => t.department_id === department);
  }
  if (status) {
    tasks = tasks.filter((t) => t.status === status);
  }

  const empName = new Map(
    employees.map((e) => [
      e.id,
      e.display_name || e.name_english || e.name_chinese || e.employee_code,
    ]),
  );
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const custName = new Map(customers.map((c) => [c.id, c.name]));

  const resolvers: TaskReportResolvers = {
    employeeName: (id) => empName.get(id) ?? id,
    departmentName: (id) => deptName.get(id) ?? id,
    categoryName: (id) => (id && catName.get(id)) || '',
    customerName: (id) => (id && custName.get(id)) || '',
  };

  const data: TaskReportData = {
    generatedOn: formatDDMMYYYY(businessDate()),
    businessDate: date,
    rows: tasks.map((t, i) => toTaskReportRow(t, i + 1, resolvers, locale)),
    tasks: tasks.map((t) => ({ businessDate: t.business_date, status: t.status })),
  };

  const html = buildTaskReportHtml(data);
  const buffer = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(buffer, `team-tasks-${date}.pdf`);
}
