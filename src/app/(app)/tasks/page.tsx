import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { businessDate } from '@/lib/domain/datetime';
import {
  getEmployees,
  getTaskDepartments,
  getTaskCategories,
  getCustomers,
  getTasks,
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
  const selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam : undefined;
  const today = businessDate();

  const [employees, departments, categories, customers, selectedTasks, carriedOver] =
    await Promise.all([
      getEmployees(),
      getTaskDepartments(),
      getTaskCategories(),
      getCustomers(),
      selectedDate ? getTasksForRange(selectedDate, selectedDate) : getTasks(),
      // Still-incomplete tasks from earlier dates, carried onto today's board
      // when a manager deliberately filters to today.
      selectedDate === today ? getOpenTasksBefore(selectedDate) : Promise.resolve([]),
    ]);
  const tasks = selectedDate === today ? [...carriedOver, ...selectedTasks] : selectedTasks;

  return (
    <div>
      <PageHeader title={t('tasks.teamTasks')} description={t('tasks.teamTasksDesc')} />
      <TasksBoard
        defaultDate={today}
        selectedDate={selectedDate}
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
