-- =============================================================================
-- Zysteel Operations — 0025 Employee photo thumbnail path
--
-- The employee list renders photos at 32px, but was signing URLs for the
-- full-resolution upload on every row. Storing a separate small-thumbnail
-- path lets the list request a much smaller object instead. Nullable and
-- additive — existing employees fall back to photo_path until re-uploaded.
-- =============================================================================

alter table public.employees
  add column if not exists photo_thumb_path text;
