-- =============================================================================
-- Zysteel Operations — 0054 Split attendance Telegram report by Office/Factory
--
-- The single "Attendance Group" destination becomes three independent ones —
-- Office, Factory, and Unclassified (an employee with no work_location set
-- yet, see 0049_employee_work_location.sql) — each with its own chat id,
-- enabled switch, and send-health columns, same shape as the existing
-- Inventory destination. Morning/afternoon schedule times stay SHARED across
-- all three (unchanged columns) — only where each shift's report is
-- delivered is split, not when.
--
-- Backfilled from the existing single attendance_chat_id/attendance_group_
-- enabled so nothing stops arriving after this upgrade: all three new
-- destinations initially point at the SAME chat (now receiving three
-- messages instead of one) until the business points Office/Factory/
-- Unclassified at different chats via Settings → Telegram.
-- =============================================================================

alter table public.telegram_settings
  add column if not exists attendance_office_chat_id text,
  add column if not exists attendance_office_enabled boolean not null default true,
  add column if not exists attendance_office_last_status text
    check (attendance_office_last_status in ('sent', 'failed')),
  add column if not exists attendance_office_last_error text,
  add column if not exists attendance_office_last_sent_at timestamptz,
  add column if not exists attendance_factory_chat_id text,
  add column if not exists attendance_factory_enabled boolean not null default true,
  add column if not exists attendance_factory_last_status text
    check (attendance_factory_last_status in ('sent', 'failed')),
  add column if not exists attendance_factory_last_error text,
  add column if not exists attendance_factory_last_sent_at timestamptz,
  add column if not exists attendance_unclassified_chat_id text,
  add column if not exists attendance_unclassified_enabled boolean not null default true,
  add column if not exists attendance_unclassified_last_status text
    check (attendance_unclassified_last_status in ('sent', 'failed')),
  add column if not exists attendance_unclassified_last_error text,
  add column if not exists attendance_unclassified_last_sent_at timestamptz;

update public.telegram_settings
  set attendance_office_chat_id = coalesce(attendance_office_chat_id, attendance_chat_id),
      attendance_office_enabled = attendance_group_enabled,
      attendance_factory_chat_id = coalesce(attendance_factory_chat_id, attendance_chat_id),
      attendance_factory_enabled = attendance_group_enabled,
      attendance_unclassified_chat_id = coalesce(attendance_unclassified_chat_id, attendance_chat_id),
      attendance_unclassified_enabled = attendance_group_enabled
  where attendance_chat_id is not null;

alter table public.telegram_settings
  drop column if exists attendance_chat_id,
  drop column if exists attendance_group_enabled,
  drop column if exists attendance_last_status,
  drop column if exists attendance_last_error,
  drop column if exists attendance_last_sent_at;

-- Widen to the new per-location groups; 'attendance' stays valid for
-- historical rows sent before this split (never written by new code).
alter table public.sent_reports drop constraint if exists sent_reports_destination_group_check;
alter table public.sent_reports
  add constraint sent_reports_destination_group_check
  check (destination_group in (
    'attendance', 'attendance_office', 'attendance_factory', 'attendance_unclassified', 'inventory'
  ));
