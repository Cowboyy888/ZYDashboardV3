-- =============================================================================
-- Zysteel Operations — 0016 daily-only pay type
-- Monthly-salary pay is removed: every employee is paid a daily rate. No
-- employee/payroll_item row anywhere has ever used 'monthly' (verified before
-- writing this migration), so tightening the check constraints is safe.
-- employee_private.base_salary is left in place (unused going forward, but
-- dropping the column is a larger, unnecessary change for a value nothing
-- references anymore).
-- =============================================================================

alter table public.employees
  alter column pay_type set default 'daily';
alter table public.employees
  drop constraint if exists employees_pay_type_check;
alter table public.employees
  add constraint employees_pay_type_check check (pay_type = 'daily');

alter table public.payroll_items
  drop constraint if exists payroll_items_pay_type_check;
alter table public.payroll_items
  add constraint payroll_items_pay_type_check check (pay_type = 'daily');

-- --- create_draft_payroll_run: drop the monthly branch ------------------------
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
    select e.id, ep.daily_rate
    from public.employees e
    left join public.employee_private ep on ep.employee_id = e.id
    where e.is_active = true
  loop
    select count(distinct business_date) into v_days
      from public.attendance
      where employee_id = emp.id
        and business_date between p_period_start and p_period_end
        and status in ('present', 'late');
    v_rate := coalesce(emp.daily_rate, 0);
    v_base := round(v_rate * coalesce(v_days, 0), 2);

    insert into public.payroll_items (payroll_run_id, employee_id, pay_type, days_worked, rate, base_amount)
    values (v_run_id, emp.id, 'daily', v_days, v_rate, v_base);
  end loop;

  return v_run_id;
end $$;
