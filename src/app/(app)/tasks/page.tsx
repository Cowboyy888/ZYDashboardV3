import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { businessDate } from '@/lib/domain/datetime';
import {
  getEmployees,
  getTaskDepartments,
  getTaskCategories,
  getCustomers,
  getTasksForRange,
  getOpenTasksBefore,
} from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { TasksBoard } from './tasks-board';

export const dynamic = 'force-dynamic';

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePermission('tasks:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { date: dateParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : businessDate();
  const isToday = date === businessDate();

  const [employees, departments, categories, customers, dayTasks, carriedOver] = await Promise.all([
    getEmployees(),
    getTaskDepartments(),
    getTaskCategories(),
    getCustomers(),
    getTasksForRange(date, date),
    // Still-incomplete tasks from earlier dates, carried onto today's board
    // so nothing silently disappears once its original date passes. Only
    // makes sense when looking at "right now" — a past date shows exactly
    // what that day actually looked like.
    isToday ? getOpenTasksBefore(date) : Promise.resolve([]),
  ]);
  const tasks = [...carriedOver, ...dayTasks];

  return (
    <div>
      <PageHeader title={t('tasks.teamTasks')} description={t('tasks.teamTasksDesc')} />
      <TasksBoard
        date={date}
        employees={employees}
        departments={departments}
        categories={categories}
        customers={customers}
        tasks={tasks}
        canManage={hasPermission(user.role, 'tasks:manage')}
      />
    </div>
  );
}
