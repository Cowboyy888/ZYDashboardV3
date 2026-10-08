/**
 * Task domain logic (Team Task & Activity Tracking).
 *
 * A task belongs to one employee, one department, and one business day.
 * "Overdue" is never stored — it's derived here from business_date + status,
 * same "derive, don't store" posture as the rest of this app (stock
 * balances, payroll_items_live, …).
 */

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  'planned',
  'in_progress',
  'completed',
  'partially_completed',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, { en: string; zh: string }> = {
  planned: { en: 'Planned', zh: '计划中' },
  in_progress: { en: 'In Progress', zh: '进行中' },
  completed: { en: 'Completed', zh: '已完成' },
  partially_completed: { en: 'Partially Completed', zh: '部分完成' },
  cancelled: { en: 'Cancelled', zh: '已取消' },
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, { en: string; zh: string }> = {
  high: { en: 'High', zh: '高' },
  medium: { en: 'Medium', zh: '中' },
  low: { en: 'Low', zh: '低' },
};

export interface TaskLike {
  employeeId: string;
  businessDate: string; // YYYY-MM-DD
  status: TaskStatus;
}

/** A task is overdue when its day has passed and it was never resolved. */
export function isOverdue(task: TaskLike, today: string): boolean {
  return task.businessDate < today && (task.status === 'planned' || task.status === 'in_progress');
}

export interface TaskCounts {
  planned: number;
  inProgress: number;
  completed: number;
  partiallyCompleted: number;
  cancelled: number;
  overdue: number;
  total: number;
  /** completed / (total - cancelled), 0 when there is nothing countable. */
  completionRate: number;
}

function emptyCounts(): TaskCounts {
  return {
    planned: 0,
    inProgress: 0,
    completed: 0,
    partiallyCompleted: 0,
    cancelled: 0,
    overdue: 0,
    total: 0,
    completionRate: 0,
  };
}

/** Roll up a set of tasks (one employee's day, or a whole team's week). */
export function summarizeTasks(tasks: TaskLike[], today: string): TaskCounts {
  const counts = emptyCounts();
  counts.total = tasks.length;
  for (const t of tasks) {
    if (t.status === 'planned') counts.planned += 1;
    else if (t.status === 'in_progress') counts.inProgress += 1;
    else if (t.status === 'completed') counts.completed += 1;
    else if (t.status === 'partially_completed') counts.partiallyCompleted += 1;
    else if (t.status === 'cancelled') counts.cancelled += 1;
    if (isOverdue(t, today)) counts.overdue += 1;
  }
  const countable = counts.total - counts.cancelled;
  counts.completionRate = countable > 0 ? counts.completed / countable : 0;
  return counts;
}

/** Combine several already-summarized counts (e.g. per-employee -> team total). */
export function mergeCounts(all: TaskCounts[]): TaskCounts {
  const counts = emptyCounts();
  for (const c of all) {
    counts.planned += c.planned;
    counts.inProgress += c.inProgress;
    counts.completed += c.completed;
    counts.partiallyCompleted += c.partiallyCompleted;
    counts.cancelled += c.cancelled;
    counts.overdue += c.overdue;
    counts.total += c.total;
  }
  const countable = counts.total - counts.cancelled;
  counts.completionRate = countable > 0 ? counts.completed / countable : 0;
  return counts;
}
