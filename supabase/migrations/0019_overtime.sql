-- =============================================================================
-- Zysteel Operations — 0019 Overtime (加班)
-- Models the 加班表 sheet of 每天跟进考勤表 as a proper table.
--
-- The sheet's formula, verbatim:
--   F = 1.25 * E    tier 1 hours (16:30–18:00) @ $1.25/h
--   H = 2.00 * G    tier 2 hours (18:00–20:00) @ $2.00/h
--   I = F + H       line total
-- The two rates are NOT hard-coded here — they live in overtime_settings so an
-- admin can change them, and each entry SNAPSHOTS the rates that applied when
-- it was recorded (same "snapshot the rate" pattern as payroll_items), so
-- historical overtime never silently re-prices when the rates change.
--
-- Amounts are GENERATED columns: the arithmetic can't drift from the formula.
-- (The source sheet had an inconsistent total range — F32 summed only F4:F26
-- while I32 summed to row 31 — which is exactly the class of bug that
-- disappears once totals are derived rather than hand-written.)
-- =============================================================================

-- --- Editable tier rates (single row, id = 1) ---------------------------------
create table if not exists public.overtime_settings (
  id             int primary key default 1 check (id = 1),
  tier1_label    text not null default '16:30-18:00',
  tier1_rate     numeric(14, 4) not null default 1.25 check (tier1_rate >= 0),
  tier2_label    text not null default '18:00-20:00',
  tier2_rate     numeric(14, 4) not null default 2.00 check (tier2_rate >= 0),
  currency       text not null default 'USD',
  updated_at     timestamptz not null default now()
);
insert into public.overtime_settings (id) values (1) on conflict (id) do nothing;

-- --- Overtime entries (one row per employee per overtime occasion) ------------
create table if not exists public.overtime_entries (
  id             uuid primary key default gen_random_uuid(),
  business_date  date not null default current_date,
  employee_id    uuid not null references public.employees(id) on delete restrict,
  description    text,                     -- 送货 / 上货 / 焊网 / 拔丝机 / 调直机
  time_range     text,                     -- free text, e.g. 16:30-20:00
  tier1_hours    numeric(6, 2) not null default 0 check (tier1_hours >= 0),
  tier2_hours    numeric(6, 2) not null default 0 check (tier2_hours >= 0),
  -- Rate snapshots (defaulted from overtime_settings by the trigger below).
  tier1_rate     numeric(14, 4) not null check (tier1_rate >= 0),
  tier2_rate     numeric(14, 4) not null check (tier2_rate >= 0),
  -- The 加班表 formula, derived — never hand-entered.
  tier1_amount   numeric(14, 2) generated always as (round(tier1_hours * tier1_rate, 2)) stored,
  tier2_amount   numeric(14, 2) generated always as (round(tier2_hours * tier2_rate, 2)) stored,
  total_amount   numeric(14, 2) generated always as (
                   round(tier1_hours * tier1_rate, 2) + round(tier2_hours * tier2_rate, 2)
                 ) stored,
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint overtime_entries_hours_chk check (tier1_hours > 0 or tier2_hours > 0)
);
create index if not exists overtime_entries_date_idx on public.overtime_entries (business_date);
create index if not exists overtime_entries_emp_idx on public.overtime_entries (employee_id);

-- Fill the rate snapshots from the current settings when not supplied.
create or replace function public.apply_overtime_rates()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if new.tier1_rate is null or new.tier2_rate is null then
    select tier1_rate, tier2_rate into s from public.overtime_settings where id = 1;
    new.tier1_rate := coalesce(new.tier1_rate, s.tier1_rate, 1.25);
    new.tier2_rate := coalesce(new.tier2_rate, s.tier2_rate, 2.00);
  end if;
  return new;
end $$;

drop trigger if exists trg_overtime_rates on public.overtime_entries;
create trigger trg_overtime_rates before insert on public.overtime_entries
  for each row execute function public.apply_overtime_rates();

drop trigger if exists trg_overtime_updated on public.overtime_entries;
create trigger trg_overtime_updated before update on public.overtime_entries
  for each row execute function public.set_updated_at();

-- --- Payroll integration ------------------------------------------------------
-- Overtime earned inside a run's period, per employee, derived from the ledger
-- of entries (never stored twice).
alter table public.payroll_items
  add column if not exists overtime_amount numeric(14, 2) not null default 0;

-- Regenerate the draft-run RPC so each payslip also carries its overtime.
-- base_amount stays "daily rate × worked days"; overtime is reported alongside
-- it so the payslip can show both, and net = base + overtime − deductions.
create or replace function public.create_draft_payroll_run(
  p_period_start date,
  p_period_end date,
  p_pay_date date,
  p_notes text
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_run_id uuid;
  emp record;
  v_days numeric;
  v_rate numeric;
  v_base numeric;
  v_ot numeric;
begin
  if p_period_end < p_period_start then
    raise exception 'Period end must not be before period start';
  end if;

  insert into public.payroll_runs (period_start, period_end, pay_date, notes, created_by)
  values (p_period_start, p_period_end, p_pay_date, p_notes, auth.uid())
  returning id into v_run_id;

  for emp in
    select e.id, e.pay_type, ep.base_salary, ep.daily_rate
    from public.employees e
    left join public.employee_private ep on ep.employee_id = e.id
    where e.is_active = true
  loop
    if emp.pay_type = 'monthly' then
      v_days := null;
      v_rate := coalesce(emp.base_salary, 0);
      v_base := v_rate;
    else
      select count(distinct business_date) into v_days
        from public.attendance
        where employee_id = emp.id
          and business_date between p_period_start and p_period_end
          and status in ('present', 'late');
      v_rate := coalesce(emp.daily_rate, 0);
      v_base := round(v_rate * coalesce(v_days, 0), 2);
    end if;

    select coalesce(sum(total_amount), 0) into v_ot
      from public.overtime_entries
      where employee_id = emp.id
        and business_date between p_period_start and p_period_end;

    insert into public.payroll_items (
      payroll_run_id, employee_id, pay_type, days_worked, rate, base_amount, overtime_amount
    ) values (v_run_id, emp.id, emp.pay_type, v_days, v_rate, v_base, v_ot);
  end loop;

  return v_run_id;
end $$;

-- --- RLS ----------------------------------------------------------------------
-- Overtime drives pay, so it follows the payroll/attendance access shape:
-- Owner / System Admin / Attendance Admin / Payroll Admin may read; Owner /
-- System Admin / Attendance Admin may record it.
alter table public.overtime_entries  enable row level security;
alter table public.overtime_settings enable row level security;

drop policy if exists overtime_entries_select on public.overtime_entries;
create policy overtime_entries_select on public.overtime_entries for select to authenticated
  using (public.auth_role() in ('owner','system_admin','attendance_admin','payroll_admin'));
drop policy if exists overtime_entries_write on public.overtime_entries;
create policy overtime_entries_write on public.overtime_entries for all to authenticated
  using (public.auth_role() in ('owner','system_admin','attendance_admin'))
  with check (public.auth_role() in ('owner','system_admin','attendance_admin'));

drop policy if exists overtime_settings_select on public.overtime_settings;
create policy overtime_settings_select on public.overtime_settings for select to authenticated
  using (public.auth_role() in ('owner','system_admin','attendance_admin','payroll_admin'));
drop policy if exists overtime_settings_write on public.overtime_settings;
create policy overtime_settings_write on public.overtime_settings for all to authenticated
  using (public.auth_role() in ('owner','system_admin'))
  with check (public.auth_role() in ('owner','system_admin'));

grant all on public.overtime_entries to anon, authenticated, service_role;
grant all on public.overtime_settings to anon, authenticated, service_role;
