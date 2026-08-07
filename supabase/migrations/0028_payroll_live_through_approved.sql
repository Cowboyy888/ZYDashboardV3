-- =============================================================================
-- Zysteel Operations — 0028 Payroll stays live through Approved, freezes at Paid
--
-- 0026 made Draft payroll runs live (payroll_items_live) but froze the numbers
-- the moment a run was Approved — Approve wrote a final snapshot and the run
-- was locked from then on. Product decision (explicit, not guessed): that
-- froze pay too early. Attendance/overtime recorded between Approve and
-- payday should still count — Approve is meant to be a sign-off checkpoint
-- (still Owner-only, still checked by enforce_payroll_run_immutable), not the
-- point the numbers stop tracking reality. Paid is the actual point of no
-- return: once money has gone out, the record must never change again.
--
-- Changes:
--   - enforce_payroll_item_immutable: the "only while draft" write window
--     widens to "while draft OR approved" — payroll_items now needs to stay
--     writable through Approved so the automatic pay-time snapshot below can
--     run. (payroll_item_lines — deduction/advance lines a human edits by
--     hand — is a SEPARATE trigger, untouched: that stays Draft-only, exactly
--     as before. This migration only affects the auto-computed columns.)
--   - pay_payroll_run(p_run_id): new RPC, same shape as 0026's
--     approve_payroll_run — write the CURRENT payroll_items_live figures into
--     payroll_items, then flip status to 'paid', atomically. This is now
--     where the "freeze the current live numbers permanently" step lives.
--   - approve_payroll_run is dropped: Approve goes back to being a plain
--     status transition (src/lib/actions/payroll.ts's shared transitionRun
--     helper) since it no longer needs to write anything — the run stays
--     live regardless of whether it's Draft or Approved.
-- =============================================================================

-- --- Payroll items: writable through Draft AND Approved, locked at Paid/Cancelled
create or replace function public.enforce_payroll_item_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  run_status text;
begin
  select status into run_status from public.payroll_runs
    where id = coalesce(new.payroll_run_id, old.payroll_run_id);
  if run_status not in ('draft', 'approved') then
    raise exception 'PAYROLL_ITEM_LOCKED: payroll items cannot be changed once the run has been paid or cancelled';
  end if;
  return coalesce(new, old);
end $$;

-- --- Pay: snapshot the CURRENT live figures, then flip status to paid --------
-- SECURITY INVOKER: RLS on payroll_items/payroll_runs still governs.
create or replace function public.pay_payroll_run(p_run_id uuid)
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
  set status = 'paid', paid_at = now()
  where id = p_run_id
    and status = 'approved';

  if not found then
    raise exception 'PAYROLL_PAY_NOT_APPROVED: only an Approved payroll run can be marked Paid';
  end if;
end $$;

grant execute on function public.pay_payroll_run(uuid) to authenticated;

-- --- approve_payroll_run is no longer needed — Approve is a plain status ----
-- --- transition again now that it doesn't freeze anything ---------------------
drop function if exists public.approve_payroll_run(uuid);
