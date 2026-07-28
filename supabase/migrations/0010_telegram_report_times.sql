-- =============================================================================
-- Zysteel Operations — 0010 editable Telegram report times
-- Morning + afternoon attendance report times become editable settings (the
-- inventory time already existed). All three are plain `HH:mm` strings in the
-- Asia/Phnom_Penh timezone; the scheduler reads them dynamically, so no time is
-- hard-coded in code. Idempotency (one send per business date) is unchanged and
-- is enforced by sent_reports.report_key = '<type>:<business_date>'.
-- =============================================================================

alter table public.telegram_settings
  add column if not exists morning_time text not null default '08:00';
alter table public.telegram_settings
  add column if not exists afternoon_time text not null default '13:00';

-- Keep the stored values well-formed HH:mm (24h). Existing rows already satisfy
-- the defaults; the constraint guards future writes.
do $$ begin
  alter table public.telegram_settings
    add constraint telegram_settings_times_chk check (
      morning_time   ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and
      afternoon_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and
      inventory_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    );
exception when duplicate_object then null; end $$;
