import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { TASK_STATUS_LABELS } from '@/lib/domain/tasks';
import { buildDailyBreakdown } from '@/lib/domain/task-performance';
import { translator, type Locale } from '@/lib/i18n';
import type { TaskRow, DailyMetricRow, TaskMetricTypeRow } from '@/lib/db/types';

/** This week's Tasks + daily activity for one employee (spec §7's Employee Detail). */
export function EmployeeTaskSummary({
  locale,
  weekDates,
  tasks,
  metrics,
  metricTypes,
}: {
  locale: Locale;
  weekDates: string[];
  tasks: TaskRow[];
  metrics: DailyMetricRow[];
  metricTypes: TaskMetricTypeRow[];
}) {
  const t = translator(locale);
  const metricLabel = (key: string) => {
    const mt = metricTypes.find((m) => m.key === key);
    return mt ? (locale === 'zh' ? mt.label_zh : mt.label_en) : key;
  };
  const days = buildDailyBreakdown(
    tasks.map((tk) => ({
      id: tk.id,
      employeeId: tk.employee_id,
      departmentId: tk.department_id,
      title: tk.title,
      businessDate: tk.business_date,
      status: tk.status,
    })),
    metrics.map((m) => ({
      employeeId: m.employee_id,
      businessDate: m.business_date,
      metricKey: m.metric_key,
      value: m.value,
    })),
    weekDates,
  );
  const hasAnything = tasks.length > 0 || metrics.length > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{t('tasks.dailyBreakdown')}</CardTitle>
        <Link href="/tasks/weekly" className="text-xs text-primary underline underline-offset-2">
          {t('tasks.weekly')}
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasAnything && <p className="text-sm text-muted-foreground">{t('tasks.noActivity')}</p>}
        {days
          .filter((d) => d.tasks.length > 0 || Object.keys(d.metrics).length > 0)
          .map((day) => (
            <div key={day.businessDate} className="space-y-1 border-b pb-2 last:border-b-0">
              <p className="text-xs font-medium text-muted-foreground">
                {formatDDMMYYYY(day.businessDate)}
              </p>
              {day.tasks.map((task) => (
                <div key={task.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{task.title}</span>
                  <Badge variant="outline">{TASK_STATUS_LABELS[task.status][locale]}</Badge>
                </div>
              ))}
              {Object.keys(day.metrics).length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {Object.entries(day.metrics)
                    .map(([key, value]) => `${metricLabel(key)}: ${value}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
