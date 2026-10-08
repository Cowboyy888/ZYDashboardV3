import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { businessDate } from '@/lib/domain/datetime';
import {
  getEmployees,
  getTaskDepartments,
  getTaskCategories,
  getCustomers,
  getTasksForRange,
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

  const [employees, departments, categories, customers, tasks] = await Promise.all([
    getEmployees(),
    getTaskDepartments(),
    getTaskCategories(),
    getCustomers(),
    getTasksForRange(date, date),
  ]);

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
