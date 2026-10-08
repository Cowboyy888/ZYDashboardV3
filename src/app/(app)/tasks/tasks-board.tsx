'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import { createTask, updateTask, changeTaskStatus, cancelTask } from '@/lib/actions/tasks';
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskStatus,
} from '@/lib/domain/tasks';
import type { ActionState } from '@/lib/actions/types';
import type {
  EmployeeRow,
  TaskDepartmentRow,
  TaskCategoryRow,
  CustomerRow,
  TaskRow,
} from '@/lib/db/types';

const STATUS_VARIANT: Record<
  TaskStatus,
  'success' | 'warning' | 'secondary' | 'destructive' | 'outline'
> = {
  planned: 'outline',
  in_progress: 'warning',
  completed: 'success',
  partially_completed: 'secondary',
  cancelled: 'destructive',
};

function employeeName(e: EmployeeRow): string {
  return e.display_name || e.name_english || e.name_chinese || e.employee_code;
}

function TaskDateNav({ date }: { date: string }) {
  const router = useRouter();
  const { t } = useT();
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="tasks-date" className="text-sm text-muted-foreground">
        {t('common.date')}
      </Label>
      <Input
        id="tasks-date"
        type="date"
        defaultValue={date}
        className="h-9 w-40"
        onChange={(e) => {
          if (e.target.value) router.push(`/tasks?date=${e.target.value}`);
        }}
      />
    </div>
  );
}

export function TasksBoard({
  date,
  employees,
  departments,
  categories,
  customers,
  tasks,
  canManage,
}: {
  date: string;
  employees: EmployeeRow[];
  departments: TaskDepartmentRow[];
  categories: TaskCategoryRow[];
  customers: CustomerRow[];
  tasks: TaskRow[];
  canManage: boolean;
}) {
  const { t, locale } = useT();
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const filtered = tasks.filter((task) => {
    if (departmentFilter !== 'all' && task.department_id !== departmentFilter) return false;
    if (statusFilter && task.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TaskDateNav date={date} />
        {canManage && <Button onClick={() => setShowCreate(true)}>{t('tasks.newTask')}</Button>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={departmentFilter} onValueChange={setDepartmentFilter}>
          <TabsList>
            <TabsTrigger value="all">{t('tasks.allDepartments')}</TabsTrigger>
            {departments.map((d) => (
              <TabsTrigger key={d.id} value={d.id}>
                {d.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <NativeSelect
          className="h-9 w-48"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t('tasks.allStatuses')}</option>
          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s][locale]}
            </option>
          ))}
        </NativeSelect>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('att.employee')}</TableHead>
                <TableHead>{t('tasks.department')}</TableHead>
                <TableHead>{t('tasks.taskTitle')}</TableHead>
                <TableHead>{t('tasks.priority')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((task) => {
                const employee = employeeById.get(task.employee_id);
                const department = departmentById.get(task.department_id);
                const category = categoryById.get(task.category_id ?? '');
                return (
                  <TableRow key={task.id}>
                    <TableCell>{employee ? employeeName(employee) : task.employee_id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {department?.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{task.title}</div>
                      {category && (
                        <div className="text-xs text-muted-foreground">{category.name}</div>
                      )}
                    </TableCell>
                    <TableCell>{TASK_PRIORITY_LABELS[task.priority][locale]}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[task.status]}>
                        {TASK_STATUS_LABELS[task.status][locale]}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {task.status !== 'completed' && task.status !== 'cancelled' && (
                            <ActionForm action={changeTaskStatus} className="space-y-0">
                              <input type="hidden" name="id" value={task.id} />
                              <input type="hidden" name="status" value="completed" />
                              <SubmitButton variant="outline" size="sm">
                                {t('tasks.markComplete')}
                              </SubmitButton>
                            </ActionForm>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setEditing(task)}>
                            {t('common.edit')}
                          </Button>
                          {task.status !== 'cancelled' && (
                            <ActionForm action={cancelTask} className="space-y-0">
                              <input type="hidden" name="id" value={task.id} />
                              <SubmitButton variant="ghost" size="sm">
                                {t('common.cancel')}
                              </SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 6 : 5}
                    className="text-center text-muted-foreground"
                  >
                    {t('tasks.noTasks')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {canManage && (
        <>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto text-left">
              <DialogHeader>
                <DialogTitle>{t('tasks.newTask')}</DialogTitle>
              </DialogHeader>
              <TaskForm
                action={createTask}
                defaultDate={date}
                employees={employees}
                departments={departments}
                categories={categories}
                customers={customers}
                onDone={() => setShowCreate(false)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto text-left">
              <DialogHeader>
                <DialogTitle>{t('tasks.editTask')}</DialogTitle>
              </DialogHeader>
              {editing && (
                <TaskForm
                  action={updateTask}
                  row={editing}
                  defaultDate={date}
                  employees={employees}
                  departments={departments}
                  categories={categories}
                  customers={customers}
                  onDone={() => setEditing(null)}
                />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function TaskForm({
  action,
  row,
  defaultDate,
  employees,
  departments,
  categories,
  customers,
  onDone,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  row?: TaskRow;
  defaultDate: string;
  employees: EmployeeRow[];
  departments: TaskDepartmentRow[];
  categories: TaskCategoryRow[];
  customers: CustomerRow[];
  onDone: () => void;
}) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const [departmentId, setDepartmentId] = useState(row?.department_id ?? '');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const categoryOptions = categories.filter((c) => c.department_id === departmentId);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {row && <input type="hidden" name="id" value={row.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tf-employee">{t('att.employee')}</Label>
          <NativeSelect id="tf-employee" name="employeeId" defaultValue={row?.employee_id} required>
            <option value="">{t('common.select')}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {employeeName(e)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tf-date">{t('common.date')}</Label>
          <Input
            id="tf-date"
            name="businessDate"
            type="date"
            defaultValue={row?.business_date ?? defaultDate}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tf-dept">{t('tasks.department')}</Label>
          <NativeSelect
            id="tf-dept"
            name="departmentId"
            defaultValue={row?.department_id}
            onChange={(e) => setDepartmentId(e.target.value)}
            required
          >
            <option value="">{t('common.select')}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tf-category">{t('tasks.category')}</Label>
          <NativeSelect id="tf-category" name="categoryId" defaultValue={row?.category_id ?? ''}>
            <option value="">{t('common.select')}</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tf-title">{t('tasks.taskTitle')}</Label>
        <Input id="tf-title" name="title" defaultValue={row?.title} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tf-desc">{t('tasks.description')}</Label>
        <Textarea id="tf-desc" name="description" defaultValue={row?.description ?? ''} rows={2} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="tf-priority">{t('tasks.priority')}</Label>
          <NativeSelect id="tf-priority" name="priority" defaultValue={row?.priority ?? 'medium'}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tf-start">{t('tasks.plannedStart')}</Label>
          <Input
            id="tf-start"
            name="plannedStart"
            type="time"
            defaultValue={row?.planned_start ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tf-end">{t('tasks.plannedEnd')}</Label>
          <Input id="tf-end" name="plannedEnd" type="time" defaultValue={row?.planned_end ?? ''} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tf-customer">{t('tasks.customer')}</Label>
        <NativeSelect id="tf-customer" name="customerId" defaultValue={row?.customer_id ?? ''}>
          <option value="">{t('common.select')}</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tf-location">{t('common.location')}</Label>
        <Input id="tf-location" name="location" defaultValue={row?.location ?? ''} />
      </div>

      {row && (
        <div className="space-y-1.5">
          <Label htmlFor="tf-status">{t('common.status')}</Label>
          <NativeSelect id="tf-status" name="status" defaultValue={row.status}>
            {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label.en}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tf-result">{t('tasks.result')}</Label>
        <Textarea id="tf-result" name="result" defaultValue={row?.result ?? ''} rows={2} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tf-notes">{t('common.notes')}</Label>
        <Textarea id="tf-notes" name="notes" defaultValue={row?.notes ?? ''} rows={2} />
      </div>

      {state?.error && <p className="text-sm text-destructive">{m(state.error)}</p>}
      <Button type="submit" disabled={pending}>
        {t('common.save')}
      </Button>
    </form>
  );
}
