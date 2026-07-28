-- =============================================================================
-- Zysteel Operations — 0015 Payroll (Fourth pass)
-- Payroll runs (one per pay period), payroll items (one per employee per run,
-- a snapshot payslip line), and payroll item lines (deductions/advances).
--
-- Design notes:
--   - Confirmed rules (per explicit product decision, not guessed): daily-rate
--     pay = daily_rate × count(DISTINCT business_date) where attendance status
--     is 'present' or 'late' within the period (a day with either shift marked
--     present/late counts once, never double-counted across morning+afternoon).
--     Monthly-salary pay = base_salary in full, unaffected by attendance.
--     USD only — no currency field, matching how base_salary/daily_rate are
--     already stored with no currency selector. Deductions/advances are simple
--     named line items per run, no cross-period running balance.
--   - `days_worked`/`rate`/`base_amount` on payroll_items are SNAPSHOTS taken
--     at generation time (create_draft_payroll_run), not live-recomputed
--     values — this satisfies the "reproducible from approved attendance +
--     rules, never a total that can silently drift" invariant (AGENTS.md)
--     while still letting an APPROVED payslip stay fixed even if attendance is
--     corrected afterward. A draft run can be deleted and regenerated to pick
--     up corrections; once approved, nothing about it can change (Draft is the
--     only editable state, exactly mirroring Purchasing/Sales). A run can be
--     cancelled from Draft or Approved (not from Paid, which is terminal) —
--     mirroring PO/SO cancellation, this never deletes anything; it freezes
--     the run in a void state for the historical record.
--   - deductions_total is NEVER stored — always derived from payroll_item_lines
--     via the payroll_item_deductions view, same "derive, don't store" pattern
--     as purchase_order_item_received / sales_order_item_delivered.
--   - Approving a run additionally requires the caller to be Owner, enforced
--     BOTH by the app (assertPermission('payroll:approve')) and by a DB
--     trigger as the ultimate authority (belt & suspenders, matching the
--     negative-stock / over-receipt / over-delivery guards).
--   - Salary figures must never appear in audit_log old_value/new_value
--     (AGENTS.md) — enforced at the application layer (src/lib/actions/payroll.ts),
--     not in SQL, since audit writes happen from the app.
-- =============================================================================

-- --- Payroll runs (one per pay period) ------------------------------------------
create table if not exists public.payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  period_start  date not null,
  period_end    date not null,
  pay_date      date not null,
  status        text not null default 'draft'
               check (status in ('draft', 'approved', 'paid', 'cancelled')),
  notes         text,
  created_by    uuid references public.profiles(id) on delete set null,
  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,
  paid_at       timestamptz,
  cancelled_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint payroll_runs_period_chk check (period_end >= period_start)
);
create index if not exists payroll_runs_status_idx on public.payroll_runs (status);
create index if not exists payroll_runs_period_idx on public.payroll_runs (period_start, period_end);

-- --- Payroll items (one payslip line per employee per run) ---------------------
-- pay_type/rate/days_worked/base_amount are snapshots computed once at
-- generation time — see design note above.
create table if not exists public.payroll_items (
  id            uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id   uuid not null references public.employees(id) on delete restrict,
  pay_type      text not null check (pay_type in ('monthly', 'daily')),
  days_worked   numeric(6, 2),
  rate          numeric(14, 2) not null check (rate >= 0),
  base_amount   numeric(14, 2) not null check (base_amount >= 0),
  created_at    timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);
create index if not exists payroll_items_run_idx on public.payroll_items (payroll_run_id);
create index if not exists payroll_items_employee_idx on public.payroll_items (employee_id);

-- --- Payroll item lines (deductions / advances) ---------------------------------
create table if not exists public.payroll_item_lines (
  id              uuid primary key default gen_random_uuid(),
  payroll_item_id uuid not null references public.payroll_items(id) on delete cascade,
  kind            text not null check (kind in ('deduction', 'advance')),
  label           text not null,
  amount          numeric(14, 2) not null check (amount > 0),
  created_at      timestamptz not null default now()
);
create index if not exists payroll_item_lines_item_idx on public.payroll_item_lines (payroll_item_id);

-- Deductions/advances total per item, derived from the lines — never stored.
create or replace view public.payroll_item_deductions
  with (security_invoker = on) as
  select payroll_item_id as item_id, sum(amount)::numeric(14, 2) as deductions_total
  from public.payroll_item_lines
  group by payroll_item_id;

-- --- Run header: lock period/pay dates once no longer draft --------------------
-- Also the one and only place draft -> approved is allowed to happen, and it
-- must be an Owner doing it — the ultimate authority behind payroll:approve.
create or replace function public.enforce_payroll_run_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor_role app_role;
begin
  if old.status is distinct from 'draft' then
    if new.period_start is distinct from old.period_start
       or new.period_end is distinct from old.period_end
       or new.pay_date is distinct from old.pay_date then
      raise exception 'PAYROLL_RUN_LOCKED: period/pay dates cannot change once the run leaves Draft';
    end if;
  end if;
  if old.status = 'draft' and new.status = 'approved' then
    actor_role := public.auth_role();
    if actor_role is distinct from 'owner' then
      raise exception 'PAYROLL_APPROVE_OWNER_ONLY: only an Owner may approve a payroll run';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_payroll_run_guard on public.payroll_runs;
create trigger trg_payroll_run_guard
  before update on public.payroll_runs
  for each row execute function public.enforce_payroll_run_immutable();

-- --- Payroll items/lines: freely editable while the run is draft ---------------
create or replace function public.enforce_payroll_item_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  run_status text;
begin
  select status into run_status from public.payroll_runs
    where id = coalesce(new.payroll_run_id, old.payroll_run_id);
  if run_status is distinct from 'draft' then
    raise exception 'PAYROLL_ITEM_LOCKED: payroll items cannot be changed once the run leaves Draft';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_payroll_items_no_update on public.payroll_items;
create trigger trg_payroll_items_no_update
  before update on public.payroll_items
  for each row execute function public.enforce_payroll_item_immutable();
drop trigger if exists trg_payroll_items_no_delete on public.payroll_items;
create trigger trg_payroll_items_no_delete
  before delete on public.payroll_items
  for each row execute function public.enforce_payroll_item_immutable();

create or replace function public.enforce_payroll_item_line_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  run_status text;
begin
  select po.status into run_status
    from public.payroll_items pi
    join public.payroll_runs po on po.id = pi.payroll_run_id
    where pi.id = coalesce(new.payroll_item_id, old.payroll_item_id);
  if run_status is distinct from 'draft' then
    raise exception 'PAYROLL_LINE_LOCKED: deduction/advance lines cannot be changed once the run leaves Draft';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_payroll_lines_no_insert on public.payroll_item_lines;
create trigger trg_payroll_lines_no_insert
  before insert on public.payroll_item_lines
  for each row execute function public.enforce_payroll_item_line_immutable();
drop trigger if exists trg_payroll_lines_no_update on public.payroll_item_lines;
create trigger trg_payroll_lines_no_update
  before update on public.payroll_item_lines
  for each row execute function public.enforce_payroll_item_line_immutable();
drop trigger if exists trg_payroll_lines_no_delete on public.payroll_item_lines;
create trigger trg_payroll_lines_no_delete
  before delete on public.payroll_item_lines
  for each row execute function public.enforce_payroll_item_line_immutable();

-- --- Atomic "generate draft payroll run" RPC ------------------------------------
-- One payroll_items row per currently-active employee: monthly employees get
-- their base_salary in full; daily employees get daily_rate × distinct
-- business dates with a 'present' or 'late' attendance row in the period
-- (either shift counts — a day is never double-counted across morning +
-- afternoon). SECURITY INVOKER: RLS on payroll_runs/payroll_items/employees/
-- employee_private/attendance still governs who may call this and what it can
-- see.
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

    insert into public.payroll_items (payroll_run_id, employee_id, pay_type, days_worked, rate, base_amount)
    values (v_run_id, emp.id, emp.pay_type, v_days, v_rate, v_base);
  end loop;

  return v_run_id;
end $$;

-- --- updated_at maintenance ------------------------------------------------------
-- (payroll_runs.updated_at is already set inside enforce_payroll_run_immutable
-- on every UPDATE; no separate generic trigger needed.)

-- --- RLS --------------------------------------------------------------------------
alter table public.payroll_runs        enable row level security;
alter table public.payroll_items       enable row level security;
alter table public.payroll_item_lines  enable row level security;

-- Salary figures live only on rows these same 3 roles can read at all — same
-- shape as employee_private's existing restriction.
drop policy if exists payroll_runs_select on public.payroll_runs;
create policy payroll_runs_select on public.payroll_runs for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'payroll_admin'));
drop policy if exists payroll_runs_write on public.payroll_runs;
create policy payroll_runs_write on public.payroll_runs for all to authenticated
  using (public.auth_role() in ('owner', 'payroll_admin'))
  with check (public.auth_role() in ('owner', 'payroll_admin'));

drop policy if exists payroll_items_select on public.payroll_items;
create policy payroll_items_select on public.payroll_items for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'payroll_admin'));
drop policy if exists payroll_items_write on public.payroll_items;
create policy payroll_items_write on public.payroll_items for all to authenticated
  using (public.auth_role() in ('owner', 'payroll_admin'))
  with check (public.auth_role() in ('owner', 'payroll_admin'));

drop policy if exists payroll_lines_select on public.payroll_item_lines;
create policy payroll_lines_select on public.payroll_item_lines for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'payroll_admin'));
drop policy if exists payroll_lines_write on public.payroll_item_lines;
create policy payroll_lines_write on public.payroll_item_lines for all to authenticated
  using (public.auth_role() in ('owner', 'payroll_admin'))
  with check (public.auth_role() in ('owner', 'payroll_admin'));

grant execute on function public.create_draft_payroll_run(date, date, date, text) to authenticated;
