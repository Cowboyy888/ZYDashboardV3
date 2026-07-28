-- =============================================================================
-- Zysteel Operations — 0005 attendance groups
-- Editable attendance groups (老板助理, 工厂主管, …) used to structure the
-- attendance Telegram report. Each employee belongs to one group and gains
-- report-facing profile fields (number, display name, job title, optional label).
-- =============================================================================

create table if not exists public.attendance_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
-- Case-insensitive unique name so seeding is idempotent and duplicates blocked.
create unique index if not exists attendance_groups_name_uidx
  on public.attendance_groups (lower(name));
create index if not exists attendance_groups_order_idx
  on public.attendance_groups (sort_order);

-- Employee profile fields used by the grouped report.
alter table public.employees
  add column if not exists attendance_group_id uuid references public.attendance_groups(id) on delete set null,
  add column if not exists employee_number text,
  add column if not exists display_name text,
  add column if not exists job_title text,
  add column if not exists label text;

create index if not exists employees_group_idx on public.employees (attendance_group_id);

-- RLS: any signed-in user may read groups; only Owner / System Admin manage them.
alter table public.attendance_groups enable row level security;

drop policy if exists attendance_groups_select on public.attendance_groups;
create policy attendance_groups_select on public.attendance_groups for select to authenticated
  using (true);

drop policy if exists attendance_groups_write on public.attendance_groups;
create policy attendance_groups_write on public.attendance_groups for all to authenticated
  using (public.auth_role() in ('owner', 'system_admin'))
  with check (public.auth_role() in ('owner', 'system_admin'));

-- Seed the initial groups in display order (idempotent).
insert into public.attendance_groups (name, sort_order) values
  ('老板助理', 1),
  ('工厂主管', 2),
  ('机器机长', 3),
  ('焊网机员工', 4),
  ('调直机员工', 5),
  ('拔丝机员工', 6),
  ('行车员', 7),
  ('采买配件房', 8),
  ('安保', 9)
on conflict do nothing;
