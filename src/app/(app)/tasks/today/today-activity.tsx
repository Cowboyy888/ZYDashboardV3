'use client';
import { useActionState, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/stat-card';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import { changeTaskStatus, saveDailyMetrics } from '@/lib/actions/tasks';
import { TASK_STATUS_LABELS, type TaskStatus } from '@/lib/domain/tasks';
import { buildEmployeePerformanceRows, buildTeamOverview } from '@/lib/domain/task-performance';
import type { ActionState } from '@/lib/actions/types';
import type {
  EmployeeRow,
  TaskDepartmentRow,
  TaskMetricTypeRow,
  TaskRow,
  DailyMetricRow,
} from '@/lib/db/types';

function employeeName(e: EmployeeRow): string {
  return e.display_name || e.name_english || e.name_chinese || e.employee_code;
}

export function TodayActivity({
  today,
  employees,
  departments,
  metricTypes,
  tasks,
  metrics,
  canManage,
}: {
  today: string;
  employees: EmployeeRow[];
  departments: TaskDepartmentRow[];
  metricTypes: TaskMetricTypeRow[];
  tasks: TaskRow[];
  metrics: DailyMetricRow[];
  canManage: boolean;
}) {
  const { t, locale } = useT();
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));

  const tasksByEmployee = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    if (!tasksByEmployee.has(task.employee_id)) tasksByEmployee.set(task.employee_id, []);
    tasksByEmployee.get(task.employee_id)!.push(task);
  }
  const employeeIds = [...tasksByEmployee.keys()].sort((a, b) => {
    const an = employeeById.get(a) ? employeeName(employeeById.get(a)!) : a;
    const bn = employeeById.get(b) ? employeeName(employeeById.get(b)!) : b;
    return an.localeCompare(bn);
  });

  const perfRows = buildEmployeePerformanceRows(
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
  const overview = buildTeamOverview(perfRows);
  const perfByEmployee = new Map(perfRows.map((r) => [r.employeeId, r]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t('att.employee')} value={employeeIds.length} />
        <StatCard label={t('tasks.planned')} value={overview.counts.total} />
        <StatCard label={t('tasks.completed')} value={overview.counts.completed} tone="success" />
        <StatCard
          label={t('tasks.remaining')}
          value={overview.counts.total - overview.counts.completed - overview.counts.cancelled}
          tone="warning"
        />
        <StatCard
          label={t('tasks.overdue')}
          value={overview.counts.overdue}
          tone={overview.counts.overdue > 0 ? 'destructive' : 'success'}
        />
      </div>

      {employeeIds.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('tasks.noActivity')}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {employeeIds.map((employeeId) => {
          const employee = employeeById.get(employeeId);
          const employeeTasks = tasksByEmployee.get(employeeId) ?? [];
          const counts = perfByEmployee.get(employeeId)!.counts;
          const departmentIds = new Set(employeeTasks.map((tk) => tk.department_id));
          const relevantMetrics = metricTypes.filter(
            (m) => !m.department_id || departmentIds.has(m.department_id),
          );
          const valueFor = (metricKey: string) =>
            metrics.find((m) => m.employee_id === employeeId && m.metric_key === metricKey)
              ?.value ?? '';

          return (
            <Card key={employeeId}>
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{employee ? employeeName(employee) : employeeId}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {[...departmentIds]
                      .map((id) => departmentById.get(id)?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </span>
                </CardTitle>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>
                    {t('tasks.planned')}: {counts.total}
                  </span>
                  <span>
                    {t('tasks.completed')}: {counts.completed}
                  </span>
                  <span>
                    {t('tasks.remaining')}: {counts.total - counts.completed - counts.cancelled}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-1.5">
                  {employeeTasks.map((task) => (
                    <li key={task.id} className="flex items-center justify-between gap-2 text-sm">
                      <span
                        className={
                          task.status === 'completed'
                            ? 'text-muted-foreground line-through'
                            : task.status === 'cancelled'
                              ? 'text-muted-foreground line-through'
                              : ''
                        }
                      >
                        {task.status === 'completed' ? '✓' : '○'} {task.title}
                      </span>
                      {canManage && task.status !== 'completed' && task.status !== 'cancelled' && (
                        <ActionForm action={changeTaskStatus} className="space-y-0">
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="status" value="completed" />
                          <SubmitButton variant="ghost" size="sm">
                            {t('tasks.markComplete')}
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {!canManage && (
                        <Badge variant="outline">
                          {TASK_STATUS_LABELS[task.status as TaskStatus][locale]}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>

                {canManage && relevantMetrics.length > 0 && (
                  <DailyMetricsForm
                    employeeId={employeeId}
                    businessDate={today}
                    metricTypes={relevantMetrics}
                    valueFor={valueFor}
                  />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DailyMetricsForm({
  employeeId,
  businessDate,
  metricTypes,
  valueFor,
}: {
  employeeId: string;
  businessDate: string;
  metricTypes: TaskMetricTypeRow[];
  valueFor: (metricKey: string) => number | string;
}) {
  const { t, m, locale } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveDailyMetrics,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    const entries = metricTypes.map((mt) => ({
      metricKey: mt.key,
      value: Number(fd.get(`metric__${mt.key}`) || 0),
    }));
    fd.set('entriesJson', JSON.stringify(entries));
    formAction(fd);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-2 border-t pt-3">
      <input type="hidden" name="employeeId" value={employeeId} />
      <input type="hidden" name="businessDate" value={businessDate} />
      <p className="text-xs font-medium text-muted-foreground">{t('tasks.todaysNumbers')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {metricTypes.map((mt) => (
          <div key={mt.key} className="space-y-1">
            <Label htmlFor={`metric-${employeeId}-${mt.key}`} className="text-xs">
              {locale === 'zh' ? mt.label_zh : mt.label_en}
            </Label>
            <Input
              id={`metric-${employeeId}-${mt.key}`}
              name={`metric__${mt.key}`}
              type="number"
              min="0"
              step="1"
              defaultValue={valueFor(mt.key)}
              className="h-8"
            />
          </div>
        ))}
      </div>
      {state?.error && <p className="text-xs text-destructive">{m(state.error)}</p>}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {t('tasks.saveNumbers')}
      </Button>
    </form>
  );
}
