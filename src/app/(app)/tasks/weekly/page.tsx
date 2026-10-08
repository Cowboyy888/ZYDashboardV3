import { requirePermission } from '@/lib/auth';
import { businessDate, formatDDMMYYYY, weekRange } from '@/lib/domain/datetime';
import {
  getEmployees,
  getTaskDepartments,
  getTaskMetricTypes,
  getTasksForRange,
  getDailyMetricsForRange,
} from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { WeekNav } from './week-nav';
import { WeeklyPerformance } from './weekly-performance';

export const dynamic = 'force-dynamic';

export default async function TasksWeeklyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requirePermission('tasks:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { date: dateParam } = await searchParams;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : businessDate();
  const { start, end } = weekRange(anchor);

  const [employees, departments, metricTypes, tasks, metrics] = await Promise.all([
    getEmployees(),
    getTaskDepartments(),
    getTaskMetricTypes(),
    getTasksForRange(start, end),
    getDailyMetricsForRange(start, end),
  ]);

  return (
    <div>
      <PageHeader
        title={t('tasks.weekly')}
        description={`${formatDDMMYYYY(start)} – ${formatDDMMYYYY(end)} · ${t('tasks.weeklyDesc')}`}
        actions={<WeekNav anchor={anchor} />}
      />
      <WeeklyPerformance
        today={businessDate()}
        employees={employees}
        departments={departments}
        metricTypes={metricTypes}
        tasks={tasks}
        metrics={metrics}
      />
    </div>
  );
}
