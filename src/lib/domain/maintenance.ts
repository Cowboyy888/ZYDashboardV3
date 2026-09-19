/**
 * Equipment maintenance — pure, no I/O.
 *
 * A maintenance record's `next_due_date` is optional (not every service has a
 * follow-up scheduled). When set, the list flags it as overdue / due soon so
 * nobody has to remember machine schedules by hand.
 */

export const MAINTENANCE_STATUSES = ['overdue', 'due_soon', 'ok', 'none'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

/** A machine due within this many days counts as "due soon", not just "ok". */
export const DUE_SOON_DAYS = 7;

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy ?? 1970, (fm ?? 1) - 1, fd ?? 1);
  const to = Date.UTC(ty ?? 1970, (tm ?? 1) - 1, td ?? 1);
  return Math.round((to - from) / 86_400_000);
}

/**
 * `none` — no next-due date set.
 * `overdue` — next-due date has already passed.
 * `due_soon` — due today or within DUE_SOON_DAYS.
 * `ok` — due further out than that.
 */
export function maintenanceStatus(nextDueDate: string | null, today: string): MaintenanceStatus {
  if (!nextDueDate) return 'none';
  const daysUntilDue = daysBetween(today, nextDueDate);
  if (daysUntilDue < 0) return 'overdue';
  if (daysUntilDue <= DUE_SOON_DAYS) return 'due_soon';
  return 'ok';
}
