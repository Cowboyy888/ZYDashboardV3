-- =============================================================================
-- Zysteel Operations — 0012 two independent Telegram destinations
-- Replaces the single `chat_id` with two separate, independently-configurable
-- destinations so one bot can post to two different groups:
--   - Attendance Group: morning + afternoon attendance reports
--   - Inventory Group:  daily inventory report (+ future low-stock / purchasing
--     alerts)
-- Each destination has its own enabled switch and last-send health (status +
-- error + timestamp) so the two Settings → Telegram cards can render without
-- ever exposing the chat id itself to the browser (masking happens in code).
-- =============================================================================

alter table public.telegram_settings
  add column if not exists attendance_chat_id text,
  add column if not exists attendance_group_enabled boolean not null default true,
  add column if not exists attendance_last_status text
    check (attendance_last_status in ('sent', 'failed')),
  add column if not exists attendance_last_error text,
  add column if not exists attendance_last_sent_at timestamptz,
  add column if not exists inventory_chat_id text,
  add column if not exists inventory_group_enabled boolean not null default true,
  add column if not exists inventory_last_status text
    check (inventory_last_status in ('sent', 'failed')),
  add column if not exists inventory_last_error text,
  add column if not exists inventory_last_sent_at timestamptz;

-- Backfill both destinations from the legacy single chat id so an existing
-- local/staging config keeps working after the upgrade.
update public.telegram_settings
  set attendance_chat_id = coalesce(attendance_chat_id, chat_id),
      inventory_chat_id  = coalesce(inventory_chat_id, chat_id)
  where chat_id is not null;

alter table public.telegram_settings drop column if exists chat_id;

-- Which destination a logged send actually used (explicit, not inferred from
-- report_type at read time). Historical rows are backfilled from report_type.
alter table public.sent_reports
  add column if not exists destination_group text
    check (destination_group in ('attendance', 'inventory'));

update public.sent_reports
  set destination_group = case
    when report_type in ('attendance_morning', 'attendance_afternoon') then 'attendance'
    when report_type = 'inventory' then 'inventory'
  end
  where destination_group is null;
