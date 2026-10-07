/**
 * Telegram report scheduling — pure, timezone-agnostic logic.
 *
 * The three scheduled reports (morning attendance, afternoon attendance, daily
 * inventory) each have an admin-editable send time (`HH:mm`, Asia/Bangkok).
 * This module answers two questions with no I/O so it is fully unit-testable:
 *
 *   1. Which reports are DUE right now? (`dueReports`) — used by the scheduler,
 *      which reads the saved times dynamically. A report is due when it is
 *      enabled, the current local time has reached its configured time, and it
 *      has not already been sent for this Cambodia business date. The
 *      "already sent" set is what makes each report fire at most once per day,
 *      even if the time is edited later the same day.
 *
 *   2. Is a chosen time earlier than the normal manual-entry time?
 *      (`isBeforeManualEntry`) — used to warn (not block) the admin.
 *
 * Times are compared as minutes-since-midnight in the SAME timezone
 * (Asia/Bangkok); callers pass the current local `HH:mm` (see
 * `currentLocalTime` in domain/datetime.ts) so the timezone lives in one place.
 */

export type ScheduledReportType = 'attendance_morning' | 'attendance_afternoon' | 'inventory';

export const SCHEDULED_REPORT_TYPES: readonly ScheduledReportType[] = [
  'attendance_morning',
  'attendance_afternoon',
  'inventory',
] as const;

/**
 * Attendance is split into three independent audiences, each with its own
 * Telegram destination (see 0054_attendance_location_destinations.sql) —
 * driven by employees.work_location (0049_employee_work_location.sql).
 * "unclassified" covers an employee with no Location set yet, so nobody
 * silently vanishes from every report while the business finishes
 * classifying staff.
 */
export const ATTENDANCE_LOCATIONS = ['office', 'factory', 'unclassified'] as const;
export type AttendanceLocation = (typeof ATTENDANCE_LOCATIONS)[number];

export const ATTENDANCE_LOCATION_LABEL: Record<AttendanceLocation, { en: string; zh: string }> = {
  office: { en: 'Office', zh: '办公室' },
  factory: { en: 'Factory', zh: '工厂' },
  unclassified: { en: 'Unclassified', zh: '未分类' },
};

/** Logical destination each report is routed to — one per attendance location, plus inventory. */
export type ReportGroup =
  'attendance_office' | 'attendance_factory' | 'attendance_unclassified' | 'inventory';

/** The `ReportGroup` for a given attendance location — column names in
 * telegram_settings follow this same `attendance_{location}_*` pattern. */
export function attendanceGroupFor(location: AttendanceLocation): ReportGroup {
  return `attendance_${location}`;
}

/**
 * Per-destination config the routing needs (subset of the `telegram_settings`
 * row). Each destination is independent: a destination with no chat id
 * configured, or with its switch off, resolves to `null` — the others are
 * unaffected.
 */
export interface TelegramDestinations {
  attendanceOfficeChatId: string | null;
  attendanceOfficeEnabled: boolean;
  attendanceFactoryChatId: string | null;
  attendanceFactoryEnabled: boolean;
  attendanceUnclassifiedChatId: string | null;
  attendanceUnclassifiedEnabled: boolean;
  inventoryChatId: string | null;
  inventoryGroupEnabled: boolean;
}

/** Resolve one attendance location's destination chat id (null if disabled/unconfigured). */
export function attendanceChatIdFor(
  location: AttendanceLocation,
  d: TelegramDestinations,
): string | null {
  if (location === 'office')
    return d.attendanceOfficeEnabled ? (d.attendanceOfficeChatId ?? null) : null;
  if (location === 'factory')
    return d.attendanceFactoryEnabled ? (d.attendanceFactoryChatId ?? null) : null;
  return d.attendanceUnclassifiedEnabled ? (d.attendanceUnclassifiedChatId ?? null) : null;
}

/** Resolve the inventory destination chat id (null if disabled/unconfigured). */
export function inventoryChatId(d: TelegramDestinations): string | null {
  return d.inventoryGroupEnabled ? (d.inventoryChatId ?? null) : null;
}

/** Factory defaults (only used when a value is missing). */
export const DEFAULT_REPORT_TIMES: Record<ScheduledReportType, string> = {
  attendance_morning: '08:00',
  attendance_afternoon: '13:00',
  inventory: '18:00',
};

/**
 * Normal manual-entry times. A scheduled send earlier than this is unusual
 * (the shift's attendance may not be entered yet), so the UI warns the admin.
 * Inventory has no manual-entry threshold.
 */
export const MANUAL_ENTRY_TIME: Record<ScheduledReportType, string | null> = {
  attendance_morning: '07:30',
  attendance_afternoon: '12:30',
  inventory: null,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a well-formed 24h `HH:mm` string. */
export function isValidHHmm(value: string | null | undefined): value is string {
  return typeof value === 'string' && HHMM.test(value);
}

/** Minutes since local midnight for an `HH:mm` string (0 for malformed input). */
export function timeToMinutes(hhmm: string): number {
  if (!isValidHHmm(hhmm)) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** The saved times + enabled flags the scheduler needs (subset of the row). */
export interface ScheduleSettings {
  morningTime: string;
  afternoonTime: string;
  inventoryTime: string;
  morningEnabled: boolean;
  afternoonEnabled: boolean;
  inventoryEnabled: boolean;
}

/** Configured send time for a report type (falls back to the factory default). */
export function timeFor(type: ScheduledReportType, s: ScheduleSettings): string {
  const raw =
    type === 'attendance_morning'
      ? s.morningTime
      : type === 'attendance_afternoon'
        ? s.afternoonTime
        : s.inventoryTime;
  return isValidHHmm(raw) ? raw : DEFAULT_REPORT_TIMES[type];
}

/** Whether a report type is enabled. */
export function enabledFor(type: ScheduledReportType, s: ScheduleSettings): boolean {
  if (type === 'attendance_morning') return s.morningEnabled;
  if (type === 'attendance_afternoon') return s.afternoonEnabled;
  return s.inventoryEnabled;
}

/**
 * Is `hhmm` earlier than the normal manual-entry time for `type`?
 * Used to warn the admin; never blocks saving.
 */
export function isBeforeManualEntry(type: ScheduledReportType, hhmm: string): boolean {
  const threshold = MANUAL_ENTRY_TIME[type];
  if (!threshold || !isValidHHmm(hhmm)) return false;
  return timeToMinutes(hhmm) < timeToMinutes(threshold);
}

export interface DueInput {
  /** Current local wall-clock time, `HH:mm`, in Asia/Bangkok. */
  nowLocal: string;
  settings: ScheduleSettings;
  /** Report types already sent for the current business date (canonical sends). */
  alreadySent?: Iterable<ScheduledReportType>;
}

/**
 * The report types that should be sent right now: enabled, past their configured
 * time, and not already sent today. Order follows SCHEDULED_REPORT_TYPES.
 */
export function dueReports({ nowLocal, settings, alreadySent }: DueInput): ScheduledReportType[] {
  const sent = new Set(alreadySent ?? []);
  const now = timeToMinutes(nowLocal);
  const due: ScheduledReportType[] = [];
  for (const type of SCHEDULED_REPORT_TYPES) {
    if (!enabledFor(type, settings)) continue; // disabled → never fires
    if (sent.has(type)) continue; // once per Cambodia business date
    if (now >= timeToMinutes(timeFor(type, settings))) due.push(type);
  }
  return due;
}
