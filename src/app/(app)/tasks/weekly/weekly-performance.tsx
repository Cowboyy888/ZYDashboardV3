'use client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/stat-card';
import { useT } from '@/components/i18n-provider';
import { buildEmployeePerformanceRows, buildTeamOverview } from '@/lib/domain/task-performance';
import type {
  EmployeeRow,
  TaskDepartmentRow,
  TaskMetricTypeRow,
  TaskRow,
  DailyMetricRow,
} from '@/lib/db/types';

/** The 5 shared/core metrics shown as columns — matches the spec's example table. */
const CORE_METRIC_KEYS = ['customer_contacts', 'visits', 'leads', 'quotations', 'orders'] as const;

export function WeeklyPerformance({
  today,
  employees,
  departments,
  metricTypes,
  tasks,
  metrics,
}: {
  today: string;
  employees: EmployeeRow[];
  departments: TaskDepartmentRow[];
  metricTypes: TaskMetricTypeRow[];
  tasks: TaskRow[];
  metrics: DailyMetricRow[];
}) {
  const { t, locale } = useT();
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const metricLabel = (key: string) => {
    const mt = metricTypes.find((m) => m.key === key);
    return mt ? (locale === 'zh' ? mt.label_zh : mt.label_en) : key;
  };

  const rows = buildEmployeePerformanceRows(
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
    employees,
    today,
  );
  const overview = buildTeamOverview(rows);

  const departmentsFor = (employeeId: string) => {
    const ids = new Set(
      tasks.filter((tk) => tk.employee_id === employeeId).map((tk) => tk.department_id),
    );
    return [...ids]
      .map((id) => departmentById.get(id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tasks.teamOverview')}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('att.employee')} value={overview.totalEmployees} />
          <StatCard
            label={t('tasks.completionRate')}
            value={`${Math.round(overview.counts.completionRate * 100)}%`}
          />
          <StatCard label={t('tasks.completed')} value={overview.counts.completed} tone="success" />
          <StatCard
            label={t('tasks.overdue')}
            value={overview.counts.overdue}
            tone={overview.counts.overdue > 0 ? 'destructive' : 'success'}
          />
          {CORE_METRIC_KEYS.map((key) => (
            <StatCard key={key} label={metricLabel(key)} value={overview.metrics[key] ?? 0} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tasks.employeePerformance')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('att.employee')}</TableHead>
                <TableHead>{t('tasks.department')}</TableHead>
                <TableHead className="text-right">{t('tasks.planned')}</TableHead>
                <TableHead className="text-right">{t('tasks.completed')}</TableHead>
                <TableHead className="text-right">{t('tasks.completionRate')}</TableHead>
                {CORE_METRIC_KEYS.map((key) => (
                  <TableHead key={key} className="text-right">
                    {metricLabel(key)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows
                .slice()
                .sort((a, b) => a.employeeName.localeCompare(b.employeeName))
                .map((row) => (
                  <TableRow key={row.employeeId}>
                    <TableCell className="font-medium">{row.employeeName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {departmentsFor(row.employeeId) || '—'}
                    </TableCell>
                    <TableCell className="text-right">{row.counts.total}</TableCell>
                    <TableCell className="text-right">{row.counts.completed}</TableCell>
                    <TableCell className="text-right">
                      {Math.round(row.counts.completionRate * 100)}%
                    </TableCell>
                    {CORE_METRIC_KEYS.map((key) => (
                      <TableCell key={key} className="text-right">
                        {row.metrics[key] ?? 0}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5 + CORE_METRIC_KEYS.length}
                    className="text-center text-muted-foreground"
                  >
                    {t('tasks.noActivity')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
