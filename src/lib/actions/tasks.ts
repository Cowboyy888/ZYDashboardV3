'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import {
  taskSchema,
  taskUpdateSchema,
  taskStatusChangeSchema,
  saveDailyMetricsSchema,
  taskDepartmentSchema,
  taskCategorySchema,
  taskMetricTypeSchema,
  type TaskInput,
} from '@/lib/validation/schemas';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

const TASKS_PATH = '/tasks';
const TASKS_TODAY_PATH = '/tasks/today';
const TASKS_WEEKLY_PATH = '/tasks/weekly';
const TASK_SETTINGS_PATH = '/settings/task-categories';

function revalidateTaskConsumers(employeeId?: string) {
  revalidatePath(TASKS_PATH);
  revalidatePath(TASKS_TODAY_PATH);
  revalidatePath(TASKS_WEEKLY_PATH);
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
}

function taskForm(formData: FormData) {
  return {
    employeeId: formData.get('employeeId'),
    departmentId: formData.get('departmentId'),
    categoryId: formData.get('categoryId'),
    businessDate: formData.get('businessDate'),
    title: formData.get('title'),
    description: formData.get('description'),
    priority: formData.get('priority') || 'medium',
    plannedStart: formData.get('plannedStart'),
    plannedEnd: formData.get('plannedEnd'),
    status: formData.get('status') || 'planned',
    result: formData.get('result'),
    customerId: formData.get('customerId'),
    location: formData.get('location'),
    notes: formData.get('notes'),
  };
}

function taskColumns(d: TaskInput) {
  return {
    employee_id: d.employeeId,
    department_id: d.departmentId,
    category_id: d.categoryId ?? null,
    business_date: d.businessDate,
    title: d.title,
    description: d.description ?? null,
    priority: d.priority,
    planned_start: d.plannedStart ?? null,
    planned_end: d.plannedEnd ?? null,
    status: d.status,
    result: d.result ?? null,
    customer_id: d.customerId ?? null,
    location: d.location ?? null,
    notes: d.notes ?? null,
  };
}

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('tasks:manage');
  const parsed = taskSchema.safeParse(taskForm(formData));
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...taskColumns(parsed.data), created_by: user.id, assigned_by: user.id })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'task.create',
    entity: 'tasks',
    entityId: data.id,
    newValue: { title: parsed.data.title, employeeId: parsed.data.employeeId },
  });
  revalidateTaskConsumers(parsed.data.employeeId);
  return ok('Task created', { taskId: data.id });
}

export async function updateTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('tasks:manage');
  const parsed = taskUpdateSchema.safeParse({ id: formData.get('id'), ...taskForm(formData) });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const { id, ...rest } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('tasks').update(taskColumns(rest)).eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'task.update',
    entity: 'tasks',
    entityId: id,
    newValue: { title: rest.title, status: rest.status },
  });
  revalidateTaskConsumers(rest.employeeId);
  return ok('Task updated');
}

/** Quick status change from a list/board row — e.g. mark Completed, add a result. */
export async function changeTaskStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('tasks:manage');
  const parsed = taskStatusChangeSchema.safeParse({
    id: formData.get('id'),
    status: formData.get('status'),
    result: formData.get('result'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: d.status, result: d.result ?? null })
    .eq('id', d.id)
    .select('employee_id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'task.status_change',
    entity: 'tasks',
    entityId: d.id,
    newValue: { status: d.status },
  });
  revalidateTaskConsumers(data?.employee_id);
  return ok('Task updated');
}

/** No hard delete — same posture as PO/SO cancellation. */
export async function cancelTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('tasks:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing task');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select('employee_id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, { action: 'task.cancel', entity: 'tasks', entityId: id });
  revalidateTaskConsumers(data?.employee_id);
  return ok('Task cancelled');
}

/**
 * Bulk upsert one employee's numbers for one day in a single call — the
 * "quick daily entry" a manager uses from Today's Team Activity. Each entry
 * REPLACES that metric's value for the day (a direct correction, same as
 * `attendance` allows — not a second correcting ledger row).
 */
export async function saveDailyMetrics(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('tasks:manage');
  let entries: unknown;
  try {
    entries = JSON.parse(String(formData.get('entriesJson') ?? '[]'));
  } catch {
    return fail('Invalid entries');
  }
  const parsed = saveDailyMetricsSchema.safeParse({
    employeeId: formData.get('employeeId'),
    businessDate: formData.get('businessDate'),
    entries,
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  if (d.entries.length === 0) return ok('Nothing to save');

  const rows = d.entries.map((e) => ({
    employee_id: d.employeeId,
    business_date: d.businessDate,
    metric_key: e.metricKey,
    value: e.value,
    created_by: user.id,
  }));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('daily_metrics')
    .upsert(rows, { onConflict: 'employee_id,business_date,metric_key' });
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'daily_metrics.save',
    entity: 'daily_metrics',
    entityId: `${d.employeeId}:${d.businessDate}`,
    newValue: Object.fromEntries(d.entries.map((e) => [e.metricKey, e.value])),
  });
  revalidateTaskConsumers(d.employeeId);
  return ok('Saved');
}

// --- Settings: task_departments / task_categories / task_metric_types -----------

function revalidateTaskSettings() {
  revalidatePath(TASK_SETTINGS_PATH);
  revalidatePath(TASKS_PATH);
  revalidatePath(TASKS_TODAY_PATH);
}

export async function createTaskDepartment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const parsed = taskDepartmentSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from('task_departments')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('task_departments')
    .insert({ name: parsed.data.name, sort_order: (last?.sort_order ?? 0) + 1, is_active: true })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return fail('That department already exists.');
    return fail(error.message);
  }
  await writeAudit(user, {
    action: 'task_department.create',
    entity: 'task_departments',
    entityId: data.id,
    newValue: parsed.data,
  });
  revalidateTaskSettings();
  return ok('Department added');
}

export async function toggleTaskDepartment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing department');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('task_departments')
    .update({ is_active: !isActive })
    .eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'task_department.archive' : 'task_department.activate',
    entity: 'task_departments',
    entityId: id,
  });
  revalidateTaskSettings();
  return ok(isActive ? 'Department archived' : 'Department reactivated');
}

export async function createTaskCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const parsed = taskCategorySchema.safeParse({
    departmentId: formData.get('departmentId'),
    name: formData.get('name'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from('task_categories')
    .select('sort_order')
    .eq('department_id', parsed.data.departmentId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from('task_categories')
    .insert({
      department_id: parsed.data.departmentId,
      name: parsed.data.name,
      sort_order: (last?.sort_order ?? 0) + 1,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return fail('That category already exists in this department.');
    return fail(error.message);
  }
  await writeAudit(user, {
    action: 'task_category.create',
    entity: 'task_categories',
    entityId: data.id,
    newValue: parsed.data,
  });
  revalidateTaskSettings();
  return ok('Category added');
}

export async function toggleTaskCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing category');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('task_categories')
    .update({ is_active: !isActive })
    .eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'task_category.archive' : 'task_category.activate',
    entity: 'task_categories',
    entityId: id,
  });
  revalidateTaskSettings();
  return ok(isActive ? 'Category archived' : 'Category reactivated');
}

export async function createTaskMetricType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const parsed = taskMetricTypeSchema.safeParse({
    key: formData.get('key'),
    departmentId: formData.get('departmentId'),
    labelEn: formData.get('labelEn'),
    labelZh: formData.get('labelZh'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data: last } = await supabase
    .from('task_metric_types')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from('task_metric_types').insert({
    key: parsed.data.key,
    department_id: parsed.data.departmentId ?? null,
    label_en: parsed.data.labelEn,
    label_zh: parsed.data.labelZh,
    sort_order: (last?.sort_order ?? 0) + 1,
    is_active: true,
  });
  if (error) {
    if (error.code === '23505') return fail('That metric key already exists.');
    return fail(error.message);
  }
  await writeAudit(user, {
    action: 'task_metric_type.create',
    entity: 'task_metric_types',
    entityId: parsed.data.key,
    newValue: parsed.data,
  });
  revalidateTaskSettings();
  return ok('Metric added');
}

export async function toggleTaskMetricType(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const key = String(formData.get('key') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!key) return fail('Missing metric');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('task_metric_types')
    .update({ is_active: !isActive })
    .eq('key', key);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'task_metric_type.archive' : 'task_metric_type.activate',
    entity: 'task_metric_types',
    entityId: key,
  });
  revalidateTaskSettings();
  return ok(isActive ? 'Metric archived' : 'Metric reactivated');
}
