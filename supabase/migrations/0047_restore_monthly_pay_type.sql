-- =============================================================================
-- Zysteel Operations — 0047 Restore monthly-salary pay type
--
-- 0016 removed monthly-salary pay (every employee paid daily) by tightening
-- employees.pay_type / payroll_items.pay_type to check (pay_type = 'daily').
-- The business now needs salaried (monthly) staff again, so this widens both
-- constraints back to ('monthly', 'daily').
--
-- create_draft_payroll_run already branches on pay_type — 0019_overtime.sql
-- redefined it (when adding overtime) with the monthly branch intact
-- (base_amount = base_salary, days_worked = null), so it needs no change here.
--
-- payroll_items_live (0026) — the live-recompute view used for Draft/Approved
-- runs — was written after 0016 and assumes daily-only, so it IS updated
-- below to branch on pay_type the same way, otherwise a monthly employee's
-- payslip would recompute to daily_rate × attendance (usually $0) in the live
-- view and get frozen at that wrong figure when the run is marked Paid.
--
-- employees.pay_type keeps its 'daily' default (most factory staff are daily
-- wage) — a monthly employee is set explicitly on the form.
-- =============================================================================

alter table public.employees
  drop constraint if exists employees_pay_type_check;
alter table public.employees
  add constraint employees_pay_type_check check (pay_type in ('monthly', 'daily'));

alter table public.payroll_items
  drop constraint if exists payroll_items_pay_type_check;
alter table public.payroll_items
  add constraint payroll_items_pay_type_check check (pay_type in ('monthly', 'daily'));

-- --- payroll_items_live: branch on pay_type, like create_draft_payroll_run -----
-- Monthly: base_amount = base_salary in full, days_worked = null, attendance
-- does not affect pay. Daily: unchanged (daily_rate × distinct present/late
-- attendance dates in the run's period).
create or replace view public.payroll_items_live
  with (security_invoker = on) as
select
  pi.id,
  pi.payroll_run_id,
  pi.employee_id,
  (case when e.pay_type = 'monthly' then null
        else coalesce(att.days_worked, 0) end)::numeric(6, 2) as live_days_worked,
  (case when e.pay_type = 'monthly' then coalesce(ep.base_salary, 0)
        else coalesce(ep.daily_rate, 0) end)::numeric(14, 2) as live_rate,
  (case when e.pay_type = 'monthly' then coalesce(ep.base_salary, 0)
        else round(coalesce(ep.daily_rate, 0) * coalesce(att.days_worked, 0), 2)
   end)::numeric(14, 2) as live_base_amount,
  coalesce(ot.overtime_amount, 0)::numeric(14, 2) as live_overtime_amount
from public.payroll_items pi
join public.payroll_runs pr on pr.id = pi.payroll_run_id
join public.employees e on e.id = pi.employee_id
left join public.employee_private ep on ep.employee_id = pi.employee_id
left join lateral (
  select count(distinct a.business_date) as days_worked
  from public.attendance a
  where a.employee_id = pi.employee_id
    and a.business_date between pr.period_start and pr.period_end
    and a.status in ('present', 'late')
) att on true
left join lateral (
  select coalesce(sum(oe.total_amount), 0) as overtime_amount
  from public.overtime_entries oe
  where oe.employee_id = pi.employee_id
    and oe.business_date between pr.period_start and pr.period_end
) ot on true;
