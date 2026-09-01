-- =============================================================================
-- Zysteel Operations — 0044 Guarded hard-delete for a zero-balance archived sku
--
-- stock_movements has NO delete (or update) RLS policy for any role — it is
-- INSERT + SELECT only, by design (the append-only ledger — see
-- 0001_schema.sql). That's a real guarantee: even Owner cannot delete a
-- ledger row through the normal app-facing client. Confirmed live while
-- building this: a plain `.delete()` from the Next.js server action silently
-- matched 0 rows (no error), then the sku delete failed on the FK restrict —
-- nothing was lost, but nothing was deleted either.
--
-- So permanently deleting a spec's ledger history — only ever allowed once
-- it's archived AND its balance has fully netted to zero, see
-- src/lib/actions/settings.ts deleteSku — can only go through this one
-- SECURITY DEFINER function, which bypasses RLS specifically for that one
-- guarded operation. Every other code path in the app still cannot touch
-- stock_movements rows once written.
--
-- Because SECURITY DEFINER bypasses RLS, this function re-checks the role
-- itself rather than trusting the caller — exactly the hardening this repo
-- already applied to product_family_usage() in 0024 ("must not trust the
-- caller's role from the app layer alone"). Every guard the app layer also
-- checks (archived, no purchase/sales order history, zero balance) is
-- re-verified here too, since the app-layer checks are a fast friendly
-- error, not the actual safety boundary.
-- =============================================================================

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

  delete from public.stock_movements where sku_id = p_sku;
  get diagnostics v_deleted = row_count;

  delete from public.skus where id = p_sku;

  return v_deleted;
end $$;

-- Same posture as every other SECURITY DEFINER function in this schema since
-- 0024: authenticated only, never anon (0011's old blanket grant + default
-- privileges are why 0024 had to fix this after the fact for
-- product_family_usage — new functions no longer default to anon-executable,
-- but authenticated still needs an explicit grant to call it at all).
revoke execute on function public.delete_archived_sku_if_empty(uuid) from public, anon;
grant execute on function public.delete_archived_sku_if_empty(uuid) to authenticated;
