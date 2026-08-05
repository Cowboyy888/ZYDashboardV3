-- =============================================================================
-- Zysteel Operations — 0026 Live-recompute view for Draft payroll runs
--
-- days_worked/rate/base_amount/overtime_amount on payroll_items are snapshots
-- taken once when a Draft run is generated (0015/0019). In practice this let a
-- Draft run silently go stale: attendance marked or corrected, or overtime
-- entered, AFTER the run was generated never showed up in it — nothing told
-- the Payroll Admin, and the only fix was to notice, cancel the run, and
-- generate a fresh one. That stale stored number is exactly the "denormalized
-- total that can drift from its source" AGENTS.md warns against.
--
-- Fix: payroll_items_live recomputes the same figures fresh from CURRENT
-- attendance/employee_private/overtime_entries, mirroring
-- create_draft_payroll_run's formula exactly. The app reads from this view
-- only while a run is still Draft (src/lib/domain/payroll-view.ts); once
-- Approved, the stored snapshot columns remain the frozen, authoritative
-- record and this view is not consulted — an approved payslip still never
-- changes.
--
-- That last point creates a new sharp edge on its own: if approving just
-- flipped payroll_runs.status, the stored payroll_items columns would still
-- hold whatever was true at GENERATION time, not what the Payroll Admin was
-- just looking at (and correcting for) in the live Draft view — approval
-- would silently discard every correction attendance had picked up since
-- the run was generated. So approve_payroll_run() below writes the CURRENT
-- live-view figures into payroll_items as the last thing that happens while
-- the run is still 'draft' (the immutability trigger still allows it at that
-- point), then flips the run to 'approved' in the same transaction — the
-- frozen record becomes "what you saw when you approved it", not "what
-- attendance happened to say the moment the draft was first generated".
-- =============================================================================

create or replace view public.payroll_items_live
  with (security_invoker = on) as
select
  pi.id,
  pi.payroll_run_id,
  pi.employee_id,
  coalesce(att.days_worked, 0)::numeric(6, 2) as live_days_worked,
  coalesce(ep.daily_rate, 0)::numeric(14, 2) as live_rate,
  round(coalesce(ep.daily_rate, 0) * coalesce(att.days_worked, 0), 2)::numeric(14, 2)
    as live_base_amount,
  coalesce(ot.overtime_amount, 0)::numeric(14, 2) as live_overtime_amount
from public.payroll_items pi
join public.payroll_runs pr on pr.id = pi.payroll_run_id
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

-- --- Approve: snapshot the CURRENT live figures, then flip status ----------------
-- SECURITY INVOKER: RLS on payroll_items/payroll_runs still governs, and the
-- existing enforce_payroll_run_immutable trigger (0015) still performs the
-- authoritative "only an Owner may approve" check on the status update below
-- — this function only reorders "write the final numbers" to happen
-- immediately before that check, atomically, instead of never happening.
create or replace function public.approve_payroll_run(p_run_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
begin
  update public.payroll_items pi
  set days_worked = live.live_days_worked,
      rate = live.live_rate,
      base_amount = live.live_base_amount,
      overtime_amount = live.live_overtime_amount
  from public.payroll_items_live live
  where live.id = pi.id
    and pi.payroll_run_id = p_run_id;

  update public.payroll_runs
  set status = 'approved', approved_at = now()
  where id = p_run_id
    and status = 'draft';

  if not found then
    raise exception 'PAYROLL_APPROVE_NOT_DRAFT: only a Draft payroll run can be approved';
  end if;
end $$;

grant execute on function public.approve_payroll_run(uuid) to authenticated;
