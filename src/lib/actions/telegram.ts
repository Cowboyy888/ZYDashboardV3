'use server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { telegramSettingsSchema } from '@/lib/validation/schemas';
import { sendReportManual, testTelegramDestination, type ReportType } from '@/lib/reports/service';
import type { ReportGroup } from '@/lib/domain/report-schedule';
import { businessDate } from '@/lib/domain/datetime';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

export async function saveTelegramSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('telegram:manage');
  const parsed = telegramSettingsSchema.safeParse({
    morningEnabled: formData.get('morningEnabled') === 'on',
    afternoonEnabled: formData.get('afternoonEnabled') === 'on',
    inventoryEnabled: formData.get('inventoryEnabled') === 'on',
    morningTime: formData.get('morningTime') || '08:00',
    afternoonTime: formData.get('afternoonTime') || '13:00',
    inventoryTime: formData.get('inventoryTime') || '18:00',
    reportLanguage: formData.get('reportLanguage') || 'zh',
    attendanceChatId: formData.get('attendanceChatId'),
    attendanceChatIdClear: formData.get('attendanceChatIdClear') === 'on',
    attendanceGroupEnabled: formData.get('attendanceGroupEnabled') === 'on',
    inventoryChatId: formData.get('inventoryChatId'),
    inventoryChatIdClear: formData.get('inventoryChatIdClear') === 'on',
    inventoryGroupEnabled: formData.get('inventoryGroupEnabled') === 'on',
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  // Read the current values first: the audit "before" state, and to know what
  // to keep when the admin left a chat-id field blank (blank = unchanged).
  const { data: before } = await supabase
    .from('telegram_settings')
    .select('morning_time, afternoon_time, inventory_time, attendance_chat_id, inventory_chat_id')
    .eq('id', 1)
    .maybeSingle();

  // A blank chat-id field means "leave it as is"; the paired Clear checkbox is
  // the only way to remove one. This is why the form never round-trips the
  // real value into the input's defaultValue (only a masked display).
  const attendanceChatId = d.attendanceChatIdClear ? null : (d.attendanceChatId ?? undefined);
  const inventoryChatId = d.inventoryChatIdClear ? null : (d.inventoryChatId ?? undefined);

  const { error } = await supabase
    .from('telegram_settings')
    .update({
      morning_enabled: d.morningEnabled,
      afternoon_enabled: d.afternoonEnabled,
      inventory_enabled: d.inventoryEnabled,
      morning_time: d.morningTime,
      afternoon_time: d.afternoonTime,
      inventory_time: d.inventoryTime,
      report_language: d.reportLanguage,
      attendance_chat_id: attendanceChatId,
      attendance_group_enabled: d.attendanceGroupEnabled,
      inventory_chat_id: inventoryChatId,
      inventory_group_enabled: d.inventoryGroupEnabled,
    })
    .eq('id', 1);
  if (error) return fail(error.message);

  const finalAttendanceChatId =
    attendanceChatId === undefined ? before?.attendance_chat_id : attendanceChatId;
  const finalInventoryChatId =
    inventoryChatId === undefined ? before?.inventory_chat_id : inventoryChatId;

  await writeAudit(user, {
    action: 'telegram.settings_update',
    entity: 'telegram_settings',
    entityId: '1',
    oldValue: {
      morning_time: before?.morning_time ?? null,
      afternoon_time: before?.afternoon_time ?? null,
      inventory_time: before?.inventory_time ?? null,
      attendanceChatId: before?.attendance_chat_id ? '***' : null,
      inventoryChatId: before?.inventory_chat_id ? '***' : null,
    },
    newValue: {
      morningEnabled: d.morningEnabled,
      afternoonEnabled: d.afternoonEnabled,
      inventoryEnabled: d.inventoryEnabled,
      morning_time: d.morningTime,
      afternoon_time: d.afternoonTime,
      inventory_time: d.inventoryTime,
      reportLanguage: d.reportLanguage,
      attendanceGroupEnabled: d.attendanceGroupEnabled,
      inventoryGroupEnabled: d.inventoryGroupEnabled,
      attendanceChatId: finalAttendanceChatId ? '***' : null,
      inventoryChatId: finalInventoryChatId ? '***' : null,
    },
  });
  revalidatePath('/settings/telegram');
  return ok('Telegram settings saved');
}

/** Admin-only "Send now" for a report type. Bypasses idempotency (resend). */
async function sendNow(type: ReportType): Promise<ActionState> {
  await assertPermission('telegram:send');
  const outcome = await sendReportManual(type, businessDate());
  if (outcome.status === 'sent') return ok(`Report sent via Telegram (${type}).`);
  if (outcome.status === 'no_chat')
    return fail('No Telegram chat id configured. Set one in Settings → Telegram.');
  return fail(`Send failed: ${outcome.detail ?? 'unknown error'}`);
}

export async function sendMorningNow(): Promise<ActionState> {
  return sendNow('attendance_morning');
}
export async function sendAfternoonNow(): Promise<ActionState> {
  return sendNow('attendance_afternoon');
}
export async function sendInventoryNow(): Promise<ActionState> {
  return sendNow('inventory');
}

/** "Test connection" for one destination card. Pings ONLY that group's chat id. */
async function testConnection(group: ReportGroup): Promise<ActionState> {
  await assertPermission('telegram:manage');
  const outcome = await testTelegramDestination(group);
  revalidatePath('/settings/telegram');
  if (outcome.status === 'sent') return ok('Test message sent.');
  if (outcome.status === 'no_chat')
    return fail('No chat ID configured (or this group is disabled).');
  return fail(`Test failed: ${outcome.detail ?? 'unknown error'}`);
}

export async function testAttendanceConnection(): Promise<ActionState> {
  return testConnection('attendance');
}
export async function testInventoryConnection(): Promise<ActionState> {
  return testConnection('inventory');
}
