-- =============================================================================
-- Zysteel Operations — 0003 Row Level Security
-- Policies mirror src/lib/domain/rbac.ts. Sensitive salary data lives in
-- employee_private and is readable only by Owner / System Admin / Payroll Admin.
-- The service-role key (server jobs) bypasses RLS by design.
-- =============================================================================

alter table public.profiles          enable row level security;
alter table public.locations         enable row level security;
alter table public.product_families  enable row level security;
alter table public.skus              enable row level security;
alter table public.stock_movements   enable row level security;
alter table public.employees         enable row level security;
alter table public.employee_private  enable row level security;
alter table public.attendance        enable row level security;
alter table public.audit_log         enable row level security;
alter table public.sent_reports      enable row level security;
alter table public.telegram_settings enable row level security;

-- --- profiles ----------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.auth_role() in ('owner','system_admin'));
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update to authenticated
  using (public.auth_role() in ('owner','system_admin'))
  with check (public.auth_role() in ('owner','system_admin'));

-- --- locations / product_families / skus (view: all staff; manage: admins) ---
drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated using (true);
drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations for all to authenticated
  using (public.auth_role() in ('owner','system_admin'))
  with check (public.auth_role() in ('owner','system_admin'));

drop policy if exists families_select on public.product_families;
create policy families_select on public.product_families for select to authenticated using (true);
drop policy if exists families_write on public.product_families;
create policy families_write on public.product_families for all to authenticated
  using (public.auth_role() in ('owner','system_admin'))
  with check (public.auth_role() in ('owner','system_admin'));

drop policy if exists skus_select on public.skus;
create policy skus_select on public.skus for select to authenticated using (true);
drop policy if exists skus_write on public.skus;
create policy skus_write on public.skus for all to authenticated
  using (public.auth_role() in ('owner','system_admin'))
  with check (public.auth_role() in ('owner','system_admin'));

-- --- stock_movements (append-only) -------------------------------------------
drop policy if exists movements_select on public.stock_movements;
create policy movements_select on public.stock_movements for select to authenticated
  using (public.auth_role() in ('owner','system_admin','warehouse_admin','sales_admin','viewer'));
drop policy if exists movements_insert on public.stock_movements;
create policy movements_insert on public.stock_movements for insert to authenticated
  with check (public.auth_role() in ('owner','system_admin','warehouse_admin'));
-- No UPDATE/DELETE policies: ledger is append-only (also enforced by triggers).

-- --- employees (non-sensitive) -----------------------------------------------
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
  using (public.auth_role() in ('owner','system_admin','payroll_admin','attendance_admin','viewer'));
drop policy if exists employees_write on public.employees;
create policy employees_write on public.employees for all to authenticated
  using (public.auth_role() in ('owner','system_admin'))
  with check (public.auth_role() in ('owner','system_admin'));

-- --- employee_private (salary + emergency contact) — SENSITIVE ---------------
drop policy if exists employee_private_all on public.employee_private;
create policy employee_private_all on public.employee_private for all to authenticated
  using (public.auth_role() in ('owner','system_admin','payroll_admin'))
  with check (public.auth_role() in ('owner','system_admin','payroll_admin'));

-- --- attendance --------------------------------------------------------------
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance for select to authenticated
  using (public.auth_role() in ('owner','system_admin','attendance_admin','payroll_admin','viewer'));
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated
  with check (public.auth_role() in ('owner','system_admin','attendance_admin'));
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (public.auth_role() in ('owner','system_admin','attendance_admin'))
  with check (public.auth_role() in ('owner','system_admin','attendance_admin'));
-- No DELETE policy: corrections are updates; records are never hard-deleted.

-- --- audit_log (insert + admin read; immutable) ------------------------------
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using (public.auth_role() in ('owner','system_admin'));
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (auth.uid() is not null);

-- --- sent_reports (admin read; usually written by service role) --------------
drop policy if exists sent_reports_select on public.sent_reports;
create policy sent_reports_select on public.sent_reports for select to authenticated
  using (public.auth_role() in ('owner','system_admin'));
drop policy if exists sent_reports_insert on public.sent_reports;
create policy sent_reports_insert on public.sent_reports for insert to authenticated
  with check (public.auth_role() in ('owner','system_admin'));

-- --- telegram_settings (admins only) -----------------------------------------
drop policy if exists tg_settings_select on public.telegram_settings;
create policy tg_settings_select on public.telegram_settings for select to authenticated
  using (public.auth_role() in ('owner','system_admin'));
drop policy if exists tg_settings_update on public.telegram_settings;
create policy tg_settings_update on public.telegram_settings for update to authenticated
  using (public.auth_role() in ('owner','system_admin'))
  with check (public.auth_role() in ('owner','system_admin'));
