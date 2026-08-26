-- =============================================================================
-- Zysteel Operations — 0039 Sales targets, KPI scorecards, commission
-- Sheets 18 (Sales Target), 07 (Salesperson KPI) and 19 (Commission) of the
-- Sales & Marketing Toolkit.
--
-- Formulas, transcribed:
--   Target   D = B × C                 GP target = revenue target × margin %
--   KPI      E = D / C                 % of target (lower-is-better lines use
--                                      IF(actual <= target, 1, target/actual))
--            F = B × E × 100           weighted score;  total = SUM(F)
--   Comm.    F = D − E                 gross profit = revenue − factory cost
--            G = F / D                 margin %
--            H = band lookup on G      commission rate
--            J = accrual by payment status
--            K = F × H × J             commission payable
--
-- Money is derived wherever Postgres allows it. Two values are SNAPSHOTS taken
-- when the entry is written — the band rate and the accrual — because both
-- depend on editable settings, and re-tuning a band must never silently
-- restate commission that has already been calculated and discussed.
-- Postgres forbids a generated column referencing another generated column, so
-- commission_payable repeats the (revenue − factory_cost) expression.
-- =============================================================================

-- --- 18 · Sales targets --------------------------------------------------------
create table if not exists public.sales_targets (
  id                  uuid primary key default gen_random_uuid(),
  employee_id         uuid not null references public.employees(id) on delete cascade,
  period              text not null,               -- YYYY-MM
  revenue_target      numeric(16, 2) not null default 0 check (revenue_target >= 0),
  target_margin_pct   numeric(5, 4) not null default 0
                      check (target_margin_pct >= 0 and target_margin_pct <= 1),
  -- D = B × C
  gp_target           numeric(16, 2) generated always as
                      (round(revenue_target * target_margin_pct, 2)) stored,
  -- Activity targets, worked backwards from the revenue number.
  orders_target       int not null default 0 check (orders_target >= 0),
  new_customers       int not null default 0 check (new_customers >= 0),
  quotations_week     int not null default 0 check (quotations_week >= 0),
  qualified_week      int not null default 0 check (qualified_week >= 0),
  contacts_day        int not null default 0 check (contacts_day >= 0),
  visits_day          int not null default 0 check (visits_day >= 0),
  leads_day           int not null default 0 check (leads_day >= 0),
  notes               text,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (employee_id, period)
);
create index if not exists sales_targets_period_idx on public.sales_targets (period);

-- --- 07 · Salesperson KPI scorecards -------------------------------------------
create table if not exists public.kpi_scorecards (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees(id) on delete cascade,
  period       text not null,                      -- YYYY-MM
  notes        text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (employee_id, period)
);

create table if not exists public.kpi_scorecard_lines (
  id               uuid primary key default gen_random_uuid(),
  scorecard_id     uuid not null references public.kpi_scorecards(id) on delete cascade,
  line_no          int not null default 1,
  label            text not null,
  weight           numeric(5, 4) not null default 0 check (weight >= 0 and weight <= 1),
  target_value     numeric(16, 4),
  actual_value     numeric(16, 4),
  -- Collections/overdue style lines score best when the actual is LOW.
  lower_is_better  boolean not null default false,
  created_at       timestamptz not null default now()
);
create index if not exists kpi_lines_scorecard_idx on public.kpi_scorecard_lines (scorecard_id);

-- --- 19 · Commission ------------------------------------------------------------
-- Margin bands: the rate is the FIRST band whose upper limit the margin is
-- below, mirroring the workbook's nested IF. The lowest band is the floor —
-- below it no commission is earned at all.
create table if not exists public.commission_bands (
  id                 uuid primary key default gen_random_uuid(),
  label              text not null,
  upper_margin_limit numeric(5, 4) not null check (upper_margin_limit >= 0 and upper_margin_limit <= 1),
  rate               numeric(5, 4) not null default 0 check (rate >= 0 and rate <= 1),
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  unique (upper_margin_limit)
);

insert into public.commission_bands (label, upper_margin_limit, rate, sort_order) values
  ('Below margin floor 低于底线 (owner approval required)', 0.10, 0.00, 1),
  ('Floor to 12%',  0.12, 0.05, 2),
  ('12% to 18%',    0.18, 0.08, 3),
  ('18% to 25%',    0.25, 0.12, 4),
  ('Above 25%',     1.00, 0.15, 5)
on conflict (upper_margin_limit) do nothing;

create table if not exists public.commission_entries (
  id               uuid primary key default gen_random_uuid(),
  period           text not null,                  -- YYYY-MM
  employee_id      uuid not null references public.employees(id) on delete restrict,
  sales_order_id   uuid references public.sales_orders(id) on delete set null,
  reference        text,                           -- SO number / free reference
  customer_name    text,
  revenue          numeric(16, 2) not null default 0 check (revenue >= 0),
  factory_cost     numeric(16, 2) not null default 0 check (factory_cost >= 0),
  payment_status   text not null default 'paid_in_full'
                   check (payment_status in
                     ('paid_in_full', 'deposit_only', 'overdue_31_60', 'bad_debt', 'other')),
  -- F = D − E, G = F / D
  gross_profit     numeric(16, 2) generated always as (revenue - factory_cost) stored,
  margin_pct       numeric(9, 6) generated always as
                   ((revenue - factory_cost) / nullif(revenue, 0)) stored,
  -- Snapshots (see header): resolved on write from the bands + payment status.
  commission_rate  numeric(5, 4) not null default 0 check (commission_rate >= 0),
  accrual_pct      numeric(5, 4) not null default 0 check (accrual_pct >= 0 and accrual_pct <= 1),
  -- K = F × H × J
  commission_payable numeric(16, 2) generated always as
                   (round((revenue - factory_cost) * commission_rate * accrual_pct, 2)) stored,
  notes            text,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists commission_period_idx on public.commission_entries (period);
create index if not exists commission_employee_idx on public.commission_entries (employee_id);

/**
 * Resolve the band rate + accrual for an entry. Runs on insert, and on update
 * only when an input that feeds them actually changed — so an entry keeps the
 * rate it was calculated at even after the bands are re-tuned.
 */
create or replace function public.apply_commission_rates()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  m numeric;
  r numeric;
begin
  m := case when new.revenue > 0 then (new.revenue - new.factory_cost) / new.revenue else 0 end;

  select b.rate into r
    from public.commission_bands b
   where m < b.upper_margin_limit
   order by b.upper_margin_limit
   limit 1;
  new.commission_rate := coalesce(r, 0);

  new.accrual_pct := case new.payment_status
    when 'paid_in_full'  then 1.0
    when 'deposit_only'  then 0.5
    when 'overdue_31_60' then 0.5
    when 'bad_debt'      then 0.0
    else 0.5
  end;
  return new;
end $$;

drop trigger if exists trg_commission_rates on public.commission_entries;
create trigger trg_commission_rates before insert on public.commission_entries
  for each row execute function public.apply_commission_rates();

drop trigger if exists trg_commission_rates_upd on public.commission_entries;
create trigger trg_commission_rates_upd before update on public.commission_entries
  for each row
  when (old.revenue is distinct from new.revenue
     or old.factory_cost is distinct from new.factory_cost
     or old.payment_status is distinct from new.payment_status)
  execute function public.apply_commission_rates();

drop trigger if exists trg_sales_targets_updated on public.sales_targets;
create trigger trg_sales_targets_updated before update on public.sales_targets
  for each row execute function public.set_updated_at();
drop trigger if exists trg_kpi_scorecards_updated on public.kpi_scorecards;
create trigger trg_kpi_scorecards_updated before update on public.kpi_scorecards
  for each row execute function public.set_updated_at();
drop trigger if exists trg_commission_updated on public.commission_entries;
create trigger trg_commission_updated before update on public.commission_entries
  for each row execute function public.set_updated_at();

-- --- RLS ------------------------------------------------------------------------
-- Targets and scorecards are management information (Owner / System Admin /
-- Sales Admin). Commission is PAY, so it follows the payroll rule: readable by
-- payroll-privileged roles, writable only by Owner / System Admin.
alter table public.sales_targets       enable row level security;
alter table public.kpi_scorecards      enable row level security;
alter table public.kpi_scorecard_lines enable row level security;
alter table public.commission_bands    enable row level security;
alter table public.commission_entries  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sales_targets','kpi_scorecards','kpi_scorecard_lines'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      || 'using (public.auth_role() in (''owner'',''system_admin'',''sales_admin''))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      || 'using (public.auth_role() in (''owner'',''system_admin'',''sales_admin'')) '
      || 'with check (public.auth_role() in (''owner'',''system_admin'',''sales_admin''))', t, t);
  end loop;

  foreach t in array array['commission_bands','commission_entries'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      || 'using (public.auth_role() in (''owner'',''system_admin'',''payroll_admin''))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      || 'using (public.auth_role() in (''owner'',''system_admin'')) '
      || 'with check (public.auth_role() in (''owner'',''system_admin''))', t, t);
  end loop;
end $$;

grant all on public.sales_targets to anon, authenticated, service_role;
grant all on public.kpi_scorecards to anon, authenticated, service_role;
grant all on public.kpi_scorecard_lines to anon, authenticated, service_role;
grant all on public.commission_bands to anon, authenticated, service_role;
grant all on public.commission_entries to anon, authenticated, service_role;
