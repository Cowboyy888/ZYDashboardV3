-- =============================================================================
-- Zysteel Operations — 0049 Employee work location (Office / Factory)
-- Separate from the existing free-text `department` (Production/Warehouse/
-- Sales/…) — this is a coarse, filterable classification of where someone
-- works, used to filter the Employees list. Nullable: existing employees are
-- unclassified until someone sets it.
-- =============================================================================

alter table public.employees
  add column if not exists work_location text check (work_location in ('office', 'factory'));

create index if not exists employees_work_location_idx on public.employees (work_location);
