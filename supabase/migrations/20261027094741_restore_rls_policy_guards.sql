-- =============================================================================
-- Zysteel Operations — restore RLS policy guards
--
-- Reassert the policies introduced in 0014_sales and 0024_harden_audit_and_rpc
-- grants. A clean local reset revealed a schema whose migration history included
-- those versions but whose live policy definitions had reverted to the 0003
-- versions. Keep this as a forward-only repair: historical migrations remain
-- immutable and production databases receive the same explicit correction.
-- =============================================================================

-- Sales Admin must be able to post a delivery; all other movement rules and
-- the append-only ledger triggers remain unchanged.
drop policy if exists movements_insert on public.stock_movements;
create policy movements_insert on public.stock_movements for insert to authenticated
  with check ((select public.auth_role()) in ('owner', 'system_admin', 'warehouse_admin', 'sales_admin'));

-- An authenticated caller may only attribute an audit event to itself. This
-- prevents forged events while preserving the append-only audit log.
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor_id = (select auth.uid()));
