import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getTelegramClient, sendReportOnce, type SendReportOutcome } from '@/lib/telegram';
import { SupabaseSentReportStore } from '@/lib/telegram/supabase-store';
import { businessDate, currentLocalTime } from '@/lib/domain/datetime';
import type { Shift } from '@/lib/domain/attendance';
import {
  dueReports,
  attendanceGroupFor,
  attendanceChatIdFor,
  inventoryChatId,
  ATTENDANCE_LOCATIONS,
  ATTENDANCE_LOCATION_LABEL,
  SCHEDULED_REPORT_TYPES,
  type ScheduledReportType,
  type ScheduleSettings,
  type ReportGroup,
  type AttendanceLocation,
  type TelegramDestinations,
} from '@/lib/domain/report-schedule';
import {
  buildGroupedAttendanceReport,
  type ReportAttendance,
  type ReportEmployee,
  type ReportGroup as AttendanceReportGroup,
} from '@/lib/domain/attendance-report';
import { renderInventoryReport, type InventoryReportRow } from '@/lib/domain/reports';
import { buildInventoryRows } from '@/lib/domain/inventory-view';
import type { SkuRow } from '@/lib/db/types';

export type ReportType = 'attendance_morning' | 'attendance_afternoon' | 'inventory';

const SHIFT_FOR: Record<'attendance_morning' | 'attendance_afternoon', Shift> = {
  attendance_morning: 'morning',
  attendance_afternoon: 'afternoon',
};

/** Read every destination's chat id + enabled switch (never their status/error). */
async function resolveDestinations(): Promise<TelegramDestinations> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('telegram_settings')
    .select(
      'attendance_office_chat_id, attendance_office_enabled, attendance_factory_chat_id, attendance_factory_enabled, inventory_chat_id, inventory_group_enabled',
    )
    .eq('id', 1)
    .maybeSingle();
  // A real DB error here (bad column, RLS denial, connection issue) must not
  // look identical to "admin genuinely hasn't configured a chat id yet" —
  // the send action would otherwise tell the user to go fix Settings when
  // Settings is actually fine. Logged, not thrown: a transient failure here
  // shouldn't crash the send attempt when fail-open (no_chat) is recoverable.
  if (error) console.error('[reports/service] resolveDestinations', error);
  return {
    attendanceOfficeChatId: (data?.attendance_office_chat_id as string | null) ?? null,
    attendanceOfficeEnabled: data?.attendance_office_enabled ?? true,
    attendanceFactoryChatId: (data?.attendance_factory_chat_id as string | null) ?? null,
    attendanceFactoryEnabled: data?.attendance_factory_enabled ?? true,
    inventoryChatId: (data?.inventory_chat_id as string | null) ?? null,
    inventoryGroupEnabled: data?.inventory_group_enabled ?? true,
  };
}

/**
 * Record the outcome of a real send attempt (sent/failed) on the destination's
 * own health columns. `skipped` (already sent) and `no_chat` (not configured)
 * are NOT recorded — they are not connection attempts, so they must not
 * overwrite the last genuine result shown on the Settings → Telegram card.
 */
async function recordDestinationHealth(
  group: ReportGroup,
  outcome: SendReportOutcome,
): Promise<void> {
  if (outcome.status !== 'sent' && outcome.status !== 'failed') return;
  const admin = createSupabaseAdminClient();
  await admin
    .from('telegram_settings')
    .update({
      [`${group}_last_status`]: outcome.status,
      [`${group}_last_error`]: outcome.detail ?? null,
      [`${group}_last_sent_at`]: new Date().toISOString(),
    })
    .eq('id', 1);
}

/** Which location bucket an employee's work_location falls into for report
 * routing. Every employee is expected to have one set; a missing/unexpected
 * value falls back to Factory rather than dropping the employee from
 * attendance reporting entirely (see 0055_remove_unclassified_attendance_destination.sql). */
function bucketFor(workLocation: string | null): AttendanceLocation {
  return workLocation === 'office' ? 'office' : 'factory';
}

/** Build the grouped attendance report body for a shift + date, split by
 * employees.work_location into Office / Factory. */
async function buildAttendanceTexts(
  shift: Shift,
  date: string,
): Promise<Record<AttendanceLocation, string>> {
  const admin = createSupabaseAdminClient();
  const [{ data: groups }, { data: employees }, { data: attendance }] = await Promise.all([
    admin
      .from('attendance_groups')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order')
      .order('name'),
    admin
      .from('employees')
      .select(
        'id, attendance_group_id, display_name, name_english, name_khmer, name_chinese, job_title, label, work_location',
      )
      .eq('is_active', true),
    admin
      .from('attendance')
      .select('employee_id, business_date, shift, status')
      .eq('business_date', date)
      .eq('shift', shift),
  ]);

  const reportGroups: AttendanceReportGroup[] = (groups ?? []).map((g) => ({
    id: g.id as string,
    name: g.name as string,
  }));

  const employeesByLocation: Record<AttendanceLocation, ReportEmployee[]> = {
    office: [],
    factory: [],
  };
  for (const e of employees ?? []) {
    const reportEmployee: ReportEmployee = {
      id: e.id as string,
      groupId: (e.attendance_group_id as string | null) ?? null,
      displayName:
        (e.display_name as string | null) ||
        (e.name_english as string | null) ||
        (e.name_khmer as string | null) ||
        (e.name_chinese as string | null) ||
        (e.id as string),
      jobTitle: (e.job_title as string | null) ?? null,
      label: (e.label as string | null) ?? null,
    };
    employeesByLocation[bucketFor(e.work_location as string | null)].push(reportEmployee);
  }

  const records: ReportAttendance[] = (attendance ?? []).map((a) => ({
    employeeId: a.employee_id as string,
    status: a.status,
  }));

  const texts = {} as Record<AttendanceLocation, string>;
  for (const location of ATTENDANCE_LOCATIONS) {
    texts[location] = buildGroupedAttendanceReport({
      date,
      shift,
      groups: reportGroups,
      employees: employeesByLocation[location],
      records,
      locationLabel: `${ATTENDANCE_LOCATION_LABEL[location].zh} ${ATTENDANCE_LOCATION_LABEL[location].en}`,
    }).text;
  }
  return texts;
}

/** Build the inventory report body for a business date. */
async function buildInventoryText(date: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const [{ data: skus }, { data: families }, { data: locations }, { data: balances }] =
    await Promise.all([
      admin.from('skus').select('*').eq('is_active', true),
      admin.from('product_families').select('*'),
      admin.from('locations').select('*'),
      admin.from('stock_balances').select('*'),
    ]);
  const rows = buildInventoryRows(skus ?? [], families ?? [], locations ?? [], balances ?? []);
  const skuById = new Map(((skus ?? []) as SkuRow[]).map((s) => [s.id, s]));
  const reportRows: InventoryReportRow[] = rows
    .filter((r) => r.total > 0 || r.isLow)
    .map((r) => {
      const sku = skuById.get(r.skuId);
      return {
        skuLabel: r.label,
        familyName: r.familyName,
        condition: r.condition,
        unit: r.unit,
        storageRoom: r.storageRoom,
        warehouse: r.warehouse,
        total: r.total,
        minimumLevel: r.minimumLevel,
        isLow: r.isLow,
        diameter: sku?.diameter ?? null,
        size: sku?.size ?? null,
        hole: sku?.hole ?? null,
        rodCount: sku?.rod_count ?? null,
        extra: sku?.extra ?? null,
        specType: r.specType,
      };
    });

  return renderInventoryReport(reportRows, { businessDate: date });
}

/**
 * Collapse several per-destination outcomes (one per attendance location)
 * into the single outcome a caller (dispatch log, "Send now" button) sees.
 * Priority: any real failure wins (so it's never silently hidden) > any real
 * send > skipped (already sent) > no_chat (every location disabled/unconfigured).
 */
function rollUpOutcomes(reportKey: string, outcomes: SendReportOutcome[]): SendReportOutcome {
  const byStatus = (s: SendReportOutcome['status']) => outcomes.filter((o) => o.status === s);
  const failed = byStatus('failed');
  if (failed.length > 0) {
    return {
      status: 'failed',
      reportKey,
      detail: failed.map((o) => `${o.reportKey}: ${o.detail ?? 'unknown error'}`).join('; '),
    };
  }
  if (byStatus('sent').length > 0) return { status: 'sent', reportKey };
  if (byStatus('skipped').length > 0)
    return { status: 'skipped', reportKey, detail: 'already sent' };
  return { status: 'no_chat', reportKey, detail: 'no chat id configured' };
}

/**
 * Send one attendance shift's report, fanned out to its two location
 * destinations (Office / Factory) — each independently idempotent via its
 * own `${type}:${date}:${location}` key, so a partial failure (e.g.
 * Factory's chat id is wrong) can retry just that location without
 * resending to Office, which already succeeded.
 */
async function sendAttendanceReport(
  type: 'attendance_morning' | 'attendance_afternoon',
  date: string,
  destinations: TelegramDestinations,
  store: SupabaseSentReportStore,
): Promise<SendReportOutcome> {
  const texts = await buildAttendanceTexts(SHIFT_FOR[type], date);
  const outcomes: SendReportOutcome[] = [];
  for (const location of ATTENDANCE_LOCATIONS) {
    const group = attendanceGroupFor(location);
    const outcome = await sendReportOnce(getTelegramClient(), store, {
      reportKey: `${type}:${date}:${location}`,
      reportType: type,
      businessDate: date,
      chatId: attendanceChatIdFor(location, destinations),
      destinationGroup: group,
      text: texts[location],
    });
    await recordDestinationHealth(group, outcome);
    outcomes.push(outcome);
  }
  return rollUpOutcomes(`${type}:${date}`, outcomes);
}

/**
 * Scheduled send: idempotent. Safe to call from a retried cron job — a report
 * already recorded as sent for (type, date[, location]) will be skipped.
 * Attendance types fan out to all three location destinations; inventory is
 * routed to exactly its own destination, same as before.
 */
export async function runScheduledReport(
  type: ReportType,
  date = businessDate(),
): Promise<SendReportOutcome> {
  const destinations = await resolveDestinations();
  const store = new SupabaseSentReportStore();

  if (type === 'inventory') {
    const chatId = inventoryChatId(destinations);
    const text = await buildInventoryText(date);
    const outcome = await sendReportOnce(getTelegramClient(), store, {
      reportKey: `${type}:${date}`,
      reportType: type,
      businessDate: date,
      chatId,
      destinationGroup: 'inventory',
      text,
    });
    await recordDestinationHealth('inventory', outcome);
    return outcome;
  }

  return sendAttendanceReport(type, date, destinations, store);
}

/**
 * Which scheduled reports have ALREADY been fully sent for `date`. Inventory
 * is one key; an attendance type needs ALL THREE of its location keys sent
 * before the scheduler stops considering it due — so a partial prior failure
 * (one location down) still gets retried for just that location. Manual
 * "Send now" rows use a different key prefix and never suppress this.
 */
async function alreadySentTypes(date: string): Promise<ScheduledReportType[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('sent_reports')
    .select('report_key')
    .eq('business_date', date)
    .eq('status', 'sent');
  const sentKeys = new Set((data ?? []).map((r) => r.report_key as string));
  return SCHEDULED_REPORT_TYPES.filter((t) => {
    if (t === 'inventory') return sentKeys.has(`inventory:${date}`);
    return ATTENDANCE_LOCATIONS.every((loc) => sentKeys.has(`${t}:${date}:${loc}`));
  });
}

export interface DispatchResult {
  date: string;
  nowLocal: string;
  due: ScheduledReportType[];
  sent: Array<{ type: ScheduledReportType; status: SendReportOutcome['status'] }>;
}

/**
 * Scheduler entry point. Reads the SAVED report times dynamically (never
 * hard-coded), figures out which reports are due at the current Asia/Bangkok
 * time and not yet sent today, and sends them idempotently. Point an external
 * cron at /api/cron/dispatch on a short interval (e.g. every 5 min); each report
 * still fires at most once per Cambodia business date, even if a time is edited
 * later that same day.
 */
export async function dispatchScheduledReports(
  now: Date = new Date(),
  date: string = businessDate(now),
): Promise<DispatchResult> {
  const admin = createSupabaseAdminClient();
  const { data: s } = await admin
    .from('telegram_settings')
    .select(
      'morning_enabled, afternoon_enabled, inventory_enabled, morning_time, afternoon_time, inventory_time',
    )
    .eq('id', 1)
    .maybeSingle();

  const settings: ScheduleSettings = {
    morningTime: (s?.morning_time as string) ?? '08:00',
    afternoonTime: (s?.afternoon_time as string) ?? '13:00',
    inventoryTime: (s?.inventory_time as string) ?? '18:00',
    morningEnabled: s?.morning_enabled ?? true,
    afternoonEnabled: s?.afternoon_enabled ?? true,
    inventoryEnabled: s?.inventory_enabled ?? true,
  };

  const nowLocal = currentLocalTime(undefined, now);
  const due = dueReports({ nowLocal, settings, alreadySent: await alreadySentTypes(date) });

  const sent: DispatchResult['sent'] = [];
  for (const type of due) {
    const outcome = await runScheduledReport(type, date);
    sent.push({ type, status: outcome.status });
  }
  return { date, nowLocal, due, sent };
}

/** One manual (idempotency-bypassing) send to a single destination, logged to sent_reports. */
async function sendManualToDestination(
  group: ReportGroup,
  reportType: string,
  date: string,
  chatId: string | null,
  text: string,
): Promise<SendReportOutcome> {
  const reportKey = `manual:${reportType}:${date}:${group}:${Date.now()}`;
  if (!chatId) {
    return { status: 'no_chat', reportKey, detail: 'no chat id configured' };
  }
  const result = await getTelegramClient().sendMessage(chatId, text);
  const admin = createSupabaseAdminClient();
  await admin.from('sent_reports').insert({
    report_key: reportKey,
    report_type: reportType,
    business_date: date,
    chat_id: chatId,
    destination_group: group,
    status: result.ok ? 'sent' : 'failed',
    detail: result.error ?? 'manual send',
  });
  const outcome: SendReportOutcome = {
    status: result.ok ? 'sent' : 'failed',
    reportKey,
    detail: result.error,
    result,
  };
  await recordDestinationHealth(group, outcome);
  return outcome;
}

/**
 * Manual "Send now" for the inventory report: bypasses the idempotency guard
 * so an Admin can resend a corrected report, but still logs the send to
 * sent_reports for the trail.
 */
export async function sendInventoryReportManual(date = businessDate()): Promise<SendReportOutcome> {
  const destinations = await resolveDestinations();
  const text = await buildInventoryText(date);
  return sendManualToDestination(
    'inventory',
    'inventory',
    date,
    inventoryChatId(destinations),
    text,
  );
}

/**
 * Manual "Send now" for ONE attendance shift, fanned out to all three
 * locations at once — the everyday case on the Attendance marking page
 * ("I just finished marking today, push the report out"). Bypasses the
 * idempotency guard; each location is still logged to sent_reports and
 * health-tracked independently. For resending to just ONE location, see
 * `sendAttendanceReportManualForLocation` below.
 */
export async function sendAttendanceReportManual(
  type: 'attendance_morning' | 'attendance_afternoon',
  date = businessDate(),
): Promise<SendReportOutcome> {
  const destinations = await resolveDestinations();
  const texts = await buildAttendanceTexts(SHIFT_FOR[type], date);
  const outcomes: SendReportOutcome[] = [];
  for (const location of ATTENDANCE_LOCATIONS) {
    outcomes.push(
      await sendManualToDestination(
        attendanceGroupFor(location),
        type,
        date,
        attendanceChatIdFor(location, destinations),
        texts[location],
      ),
    );
  }
  return rollUpOutcomes(`manual:${type}:${date}`, outcomes);
}

/**
 * Manual "Send now" for ONE attendance shift + ONE location (Office /
 * Factory) — e.g. resend just to Factory because their chat didn't receive
 * it, without re-sending to Office who already got it fine. Bypasses the
 * idempotency guard; still logs the send to sent_reports.
 */
export async function sendAttendanceReportManualForLocation(
  type: 'attendance_morning' | 'attendance_afternoon',
  location: AttendanceLocation,
  date = businessDate(),
): Promise<SendReportOutcome> {
  const destinations = await resolveDestinations();
  const texts = await buildAttendanceTexts(SHIFT_FOR[type], date);
  return sendManualToDestination(
    attendanceGroupFor(location),
    type,
    date,
    attendanceChatIdFor(location, destinations),
    texts[location],
  );
}

/**
 * "Test connection" for a single destination (Settings → Telegram cards).
 * Sends a small ping to THAT group's chat id only — never touches the other
 * group's chat id — and updates that destination's last status/error.
 *
 * `overrideChatId`, when given, is sent to DIRECTLY instead of looking up the
 * saved chat id — this lets the Settings page test a newly-typed chat id
 * before it's been saved (otherwise "Test connection" would silently test
 * the OLD saved value, or fail with "no chat id configured" for a
 * not-yet-saved first-time setup, which is confusing since the id is right
 * there in the input).
 */
const TEST_DESTINATION_LABEL: Record<ReportGroup, string> = {
  attendance_office: 'Attendance — Office',
  attendance_factory: 'Attendance — Factory',
  inventory: 'Inventory Group',
};

export async function testTelegramDestination(
  group: ReportGroup,
  overrideChatId?: string,
): Promise<SendReportOutcome> {
  let chatId: string | null;
  if (overrideChatId) {
    chatId = overrideChatId;
  } else {
    const destinations = await resolveDestinations();
    if (group === 'inventory') {
      chatId = inventoryChatId(destinations);
    } else {
      const location: AttendanceLocation = group === 'attendance_office' ? 'office' : 'factory';
      chatId = attendanceChatIdFor(location, destinations);
    }
  }

  const reportKey = `test:${group}:${Date.now()}`;
  if (!chatId) {
    return { status: 'no_chat', reportKey, detail: 'no chat id configured' };
  }

  const label = TEST_DESTINATION_LABEL[group];
  const result = await getTelegramClient().sendMessage(
    chatId,
    `✅ Zysteel Operations — ${label} connection test`,
  );

  const admin = createSupabaseAdminClient();
  await admin.from('sent_reports').insert({
    report_key: reportKey,
    report_type: `test_${group}`,
    business_date: businessDate(),
    chat_id: chatId,
    destination_group: group,
    status: result.ok ? 'sent' : 'failed',
    detail: result.error ?? 'connection test',
  });

  const outcome: SendReportOutcome = {
    status: result.ok ? 'sent' : 'failed',
    reportKey,
    detail: result.error,
    result,
  };
  // Only record health for the SAVED chat id — a failed test of an ad-hoc,
  // not-yet-saved candidate id must not overwrite the real destination's
  // last-known-good status on the Settings page.
  if (!overrideChatId) await recordDestinationHealth(group, outcome);
  return outcome;
}
