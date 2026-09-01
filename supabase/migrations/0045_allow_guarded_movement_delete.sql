-- =============================================================================
-- Zysteel Operations — 0045 A narrow, explicit exception to the no-hard-delete
-- guard, for stock_movements only
--
-- 0002_functions_triggers.sql's prevent_delete() unconditionally blocks any
-- delete on stock_movements OR audit_log — confirmed live while building
-- 0044 that this holds even against a SECURITY DEFINER function bypassing
-- RLS, which is exactly what that trigger is for. The user explicitly asked,
-- after being shown this, to relax it for stock_movements specifically (a
-- zero-balance archived spec's now-pointless ledger rows) — NOT for
-- audit_log, which must stay absolutely untouched.
--
-- So: a SEPARATE trigger function for stock_movements (audit_log keeps using
-- the original prevent_delete() unmodified), gated on a transaction-local
-- session flag that ONLY delete_archived_sku_if_empty() ever sets, right
-- before its own guarded delete — after it has already re-verified archived,
-- no purchase/sales order history, and zero balance. `set_config(..., true)`
-- (the `true` third arg) is transaction-local: it cannot leak to any other
-- session, and resets the instant this transaction ends, so the exception is
-- reachable only from inside that one call, in that one transaction.
-- =============================================================================

create or replace function public.prevent_movement_delete()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('app.allow_movement_delete', true), '') = 'true' then
    return old;
  end if;
  raise exception 'DELETE_FORBIDDEN: % records must not be hard-deleted', tg_table_name;
end $$;

drop trigger if exists trg_movements_no_delete on public.stock_movements;
create trigger trg_movements_no_delete before delete on public.stock_movements
  for each row execute function public.prevent_movement_delete();

create or replace function public.delete_archived_sku_if_empty(p_sku uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.auth_role();
  v_is_active boolean;
  v_total numeric;
  v_deleted int;
begin
  if v_role not in ('owner', 'system_admin') then
    raise exception 'Forbidden: missing permission products:manage';
  end if;

  select is_active into v_is_active from public.skus where id = p_sku;
  if v_is_active is null then
    raise exception 'Specification not found';
  end if;
  if v_is_active then
    raise exception 'Cannot delete: this specification has records. Archive it instead.';
  end if;

  if exists (select 1 from public.purchase_order_items where sku_id = p_sku) then
    raise exception 'Cannot delete: this specification has purchase order history. Archive it instead.';
  end if;

  if exists (select 1 from public.sales_order_items where sku_id = p_sku) then
    raise exception 'Cannot delete: this specification has sales order history. Archive it instead.';
  end if;

  select coalesce(sum(quantity), 0) into v_total
    from public.stock_balances where sku_id = p_sku;
  if v_total <> 0 then
    raise exception 'Cannot delete: this specification still has stock. Archive it instead.';
  end if;

  -- Transaction-local — every guard above has already passed by the time
  -- this is set, and it's gone the moment this transaction ends either way.
  perform set_config('app.allow_movement_delete', 'true', true);

  delete from public.stock_movements where sku_id = p_sku;
  get diagnostics v_deleted = row_count;

  delete from public.skus where id = p_sku;

  return v_deleted;
end $$;
