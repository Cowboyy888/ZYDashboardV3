import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import {
  getEmployees,
  getTaskDepartments,
  getTaskMetricTypes,
  getTasksForRange,
  getOpenTasksBefore,
  getDailyMetricsForRange,
} from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { TodayActivity } from './today-activity';

export const dynamic = 'force-dynamic';

export default async function TasksTodayPage() {
  const user = await requirePermission('tasks:view');
  const locale = await getLocale();
  const t = translator(locale);
  const today = businessDate();

  const [employees, departments, metricTypes, todayTasks, carriedOver, metrics] = await Promise.all(
    [
      getEmployees(),
      getTaskDepartments(),
      getTaskMetricTypes(),
      getTasksForRange(today, today),
      // Still-incomplete tasks from earlier dates — kept on today's activity
      // view instead of disappearing once their original date passes.
      getOpenTasksBefore(today),
      getDailyMetricsForRange(today, today),
    ],
  );
  const tasks = [...carriedOver, ...todayTasks];

  return (
    <div>
      <PageHeader
        title={t('tasks.today')}
        description={`${formatDDMMYYYY(today)} · ${t('tasks.todayDesc')}`}
      />
      <TodayActivity
        today={today}
        employees={employees}
        departments={departments}
        metricTypes={metricTypes}
        tasks={tasks}
        metrics={metrics}
        canManage={hasPermission(user.role, 'tasks:manage')}
      />
    </div>
  );
}
