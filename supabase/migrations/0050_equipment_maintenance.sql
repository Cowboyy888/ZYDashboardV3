-- =============================================================================
-- Zysteel Operations — 0050 Equipment maintenance log
--
-- Factory-floor machine maintenance history: what machine, when it was
-- serviced, who did it, and when it's next due — so overdue/due-soon
-- machines can be flagged instead of relying on someone's memory.
--
-- Machine is free text (no separate equipment catalog — confirmed with the
-- business: fastest to ship, and the factory's machine set is small/known by
-- name already, same reasoning as free-text `department` on employees).
-- Technician is a real employees FK (not free text) — consistent with
-- salesperson_id on sales_inquiries/quotations.
-- =============================================================================

create table if not exists public.equipment_maintenance (
  id              uuid primary key default gen_random_uuid(),
  machine_name    text not null,
  performed_on    date not null default current_date,
  technician_id   uuid references public.employees(id) on delete set null,
  -- When this machine is next due for maintenance — drives the overdue/due-soon
  -- flagging in the UI (see domain/maintenance.ts). Null = no schedule set.
  next_due_date   date,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists equipment_maintenance_machine_idx
  on public.equipment_maintenance (machine_name);
create index if not exists equipment_maintenance_performed_idx
  on public.equipment_maintenance (performed_on);
create index if not exists equipment_maintenance_next_due_idx
  on public.equipment_maintenance (next_due_date);
create index if not exists equipment_maintenance_technician_idx
  on public.equipment_maintenance (technician_id);

drop trigger if exists trg_equipment_maintenance_updated on public.equipment_maintenance;
create trigger trg_equipment_maintenance_updated before update on public.equipment_maintenance
  for each row execute function public.set_updated_at();

-- --- RLS: same posture as Purchasing (0013) — factory-floor operational data --
-- system_admin oversees (read-only), warehouse_admin runs it day to day.
alter table public.equipment_maintenance enable row level security;

drop policy if exists equipment_maintenance_select on public.equipment_maintenance;
create policy equipment_maintenance_select on public.equipment_maintenance for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'warehouse_admin'));

drop policy if exists equipment_maintenance_write on public.equipment_maintenance;
create policy equipment_maintenance_write on public.equipment_maintenance for all to authenticated
  using (public.auth_role() in ('owner', 'warehouse_admin'))
  with check (public.auth_role() in ('owner', 'warehouse_admin'));

grant all on public.equipment_maintenance to anon, authenticated, service_role;
