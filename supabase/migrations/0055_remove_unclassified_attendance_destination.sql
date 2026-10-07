-- =============================================================================
-- Zysteel Operations — 0055 Remove the Unclassified attendance destination
--
-- Confirmed with the business: every employee now has a Location (Office/
-- Factory) set, so the "Unclassified" destination added in
-- 0054_attendance_location_destinations.sql is unused. Drops its columns;
-- an employee who somehow has no Location set in the future falls back to
-- the Factory report instead of a dedicated section (see `bucketFor` in
-- src/lib/reports/service.ts and src/lib/reports/preview.ts) — attendance
-- reporting never silently drops anyone, it just no longer has a third
-- destination to put them in.
--
-- sent_reports.destination_group's check constraint is intentionally left
-- alone: it already keeps 'attendance' (the pre-0054 legacy value) allowed
-- for historical rows even though new code never writes it, and
-- 'attendance_unclassified' now joins it in that same "historical only"
-- category — no need to touch the constraint for that, same reasoning 0054
-- applied to 'attendance'.
-- =============================================================================

alter table public.telegram_settings
  drop column if exists attendance_unclassified_chat_id,
  drop column if exists attendance_unclassified_enabled,
  drop column if exists attendance_unclassified_last_status,
  drop column if exists attendance_unclassified_last_error,
  drop column if exists attendance_unclassified_last_sent_at;
