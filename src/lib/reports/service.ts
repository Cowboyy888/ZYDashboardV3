import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getTelegramClient, sendReportOnce, type SendReportOutcome } from '@/lib/telegram';
import { SupabaseSentReportStore } from '@/lib/telegram/supabase-store';
import { businessDate, currentLocalTime } from '@/lib/domain/datetime';
import type { Shift } from '@/lib/domain/attendance';
import {
  dueReports,
  reportGroup,
  destinationChatId,
  SCHEDULED_REPORT_TYPES,
  type ScheduledReportType,
  type ScheduleSettings,
  type ReportGroup,
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

/** Read both destinations' chat id + enabled switch (never their status/error). */
async function resolveDestinations(): Promise<TelegramDestinations> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('telegram_settings')
    .select(
      'attendance_chat_id, attendance_group_enabled, inventory_chat_id, inventory_group_enabled',
    )
    .eq('id', 1)
    .maybeSingle();
  return {
    attendanceChatId: (data?.attendance_chat_id as string | null) ?? null,
    attendanceGroupEnabled: data?.attendance_group_enabled ?? true,
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

/** Build the grouped attendance report body for a shift + date. */
async function buildAttendanceText(shift: Shift, date: string): Promise<string> {
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
        'id, attendance_group_id, employee_number, display_name, name_english, name_khmer, name_chinese, job_title, label',
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

  const reportEmployees: ReportEmployee[] = (employees ?? []).map((e) => ({
    id: e.id as string,
    groupId: (e.attendance_group_id as string | null) ?? null,
    displayName:
      (e.display_name as string | null) ||
      (e.name_english as string | null) ||
      (e.name_khmer as string | null) ||
      (e.name_chinese as string | null) ||
      (e.employee_number as string | null) ||
      (e.id as string),
    employeeNumber: (e.employee_number as string | null) ?? null,
    jobTitle: (e.job_title as string | null) ?? null,
    label: (e.label as string | null) ?? null,
  }));

  const records: ReportAttendance[] = (attendance ?? []).map((a) => ({
    employeeId: a.employee_id as string,
    status: a.status,
  }));

  return buildGroupedAttendanceReport({
    date,
    shift,
    groups: reportGroups,
    employees: reportEmployees,
    records,
  }).text;
}

/** Build the message body for a report type + business date. */
export async function buildReportText(type: ReportType, date: string): Promise<string> {
  if (type === 'inventory') {
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
        };
      });

    return renderInventoryReport(reportRows, { businessDate: date });
  }

  return buildAttendanceText(SHIFT_FOR[type], date);
}

/**
 * Scheduled send: idempotent. Safe to call from a retried cron job — a report
 * already recorded as sent for (type, date) will be skipped. Routed to
 * EXACTLY ONE destination (`reportGroup(type)`); the other group's chat id is
 * never read for this type, let alone sent to.
 */
export async function runScheduledReport(
  type: ReportType,
  date = businessDate(),
): Promise<SendReportOutcome> {
  const destinations = await resolveDestinations();
  const chatId = destinationChatId(type, destinations);
  const group = reportGroup(type);
  const text = await buildReportText(type, date);
  const outcome = await sendReportOnce(getTelegramClient(), new SupabaseSentReportStore(), {
    reportKey: `${type}:${date}`,
    reportType: type,
    businessDate: date,
    chatId,
    destinationGroup: group,
    text,
  });
  await recordDestinationHealth(group, outcome);
  return outcome;
}

/**
 * Which scheduled reports have ALREADY been sent for `date` (canonical key
 * `<type>:<date>`, status 'sent'). Manual "Send now" rows use a different key
 * and never suppress the scheduled send.
 */
async function alreadySentTypes(date: string): Promise<ScheduledReportType[]> {
  const admin = createSupabaseAdminClient();
  const keys = SCHEDULED_REPORT_TYPES.map((t) => `${t}:${date}`);
  const { data } = await admin
    .from('sent_reports')
    .select('report_type, report_key, status')
    .eq('business_date', date)
    .eq('status', 'sent')
    .in('report_key', keys);
  const sent = new Set((data ?? []).map((r) => r.report_type as string));
  return SCHEDULED_REPORT_TYPES.filter((t) => sent.has(t));
}

export interface DispatchResult {
  date: string;
  nowLocal: string;
  due: ScheduledReportType[];
  sent: Array<{ type: ScheduledReportType; status: SendReportOutcome['status'] }>;
}

/**
 * Scheduler entry point. Reads the SAVED report times dynamically (never
 * hard-coded), figures out which reports are due at the current Asia/Phnom_Penh
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

/**
 * Manual "Send now": bypasses the idempotency guard so an Admin can resend a
 * corrected report, but still logs the send to sent_reports for the trail.
 * Routed to the same single destination a scheduled send of this type would use.
 */
export async function sendReportManual(
  type: ReportType,
  date = businessDate(),
): Promise<SendReportOutcome> {
  const destinations = await resolveDestinations();
  const chatId = destinationChatId(type, destinations);
  const group = reportGroup(type);
  const text = await buildReportText(type, date);
  if (!chatId) {
    return {
      status: 'no_chat',
      reportKey: `manual:${type}:${date}`,
      detail: 'no chat id configured',
    };
  }
  const result = await getTelegramClient().sendMessage(chatId, text);
  const admin = createSupabaseAdminClient();
  await admin.from('sent_reports').insert({
    report_key: `manual:${type}:${date}:${Date.now()}`,
    report_type: type,
    business_date: date,
    chat_id: chatId,
    destination_group: group,
    status: result.ok ? 'sent' : 'failed',
    detail: result.error ?? 'manual send',
  });
  const outcome: SendReportOutcome = {
    status: result.ok ? 'sent' : 'failed',
    reportKey: `manual:${type}:${date}`,
    detail: result.error,
    result,
  };
  await recordDestinationHealth(group, outcome);
  return outcome;
}

/**
 * "Test connection" for a single destination (Settings → Telegram cards).
 * Sends a small ping to THAT group's chat id only — never touches the other
 * group's chat id — and updates that destination's last status/error.
 */
export async function testTelegramDestination(group: ReportGroup): Promise<SendReportOutcome> {
  const destinations = await resolveDestinations();
  const chatId =
    group === 'attendance'
      ? destinations.attendanceGroupEnabled
        ? destinations.attendanceChatId
        : null
      : destinations.inventoryGroupEnabled
        ? destinations.inventoryChatId
        : null;

  const reportKey = `test:${group}:${Date.now()}`;
  if (!chatId) {
    return { status: 'no_chat', reportKey, detail: 'no chat id configured' };
  }

  const label = group === 'attendance' ? 'Attendance Group' : 'Inventory Group';
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
  await recordDestinationHealth(group, outcome);
  return outcome;
}
