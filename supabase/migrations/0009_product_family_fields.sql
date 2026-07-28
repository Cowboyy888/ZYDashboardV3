-- =============================================================================
-- Zysteel Operations — 0009 product family management
-- Adds an optional English name + description to product families, and a
-- SECURITY DEFINER helper that reports whether a family has any history
-- (specifications, stock movements, production, purchases, sales) so the app can
-- offer a safe permanent Delete only when none exists, and Archive otherwise.
--
-- Note: deletion is ALSO hard-guarded by referential integrity — skus.family_id
-- references product_families(id) ON DELETE RESTRICT, and every stock movement /
-- purchase / sale / production record ultimately references a sku. So a family
-- with any history cannot be deleted even if the app check were bypassed. This
-- function powers the friendly pre-check + "Archive instead" message.
-- =============================================================================

alter table public.product_families
  add column if not exists name_english text;
alter table public.product_families
  add column if not exists description text;

-- Reports usage counts for a family. purchase/sales tables are Phase 2; the
-- to_regclass guards keep this forward-compatible (they contribute 0 until the
-- tables exist, at which point this function is the single place to extend).
create or replace function public.product_family_usage(p_family uuid)
returns table (
  spec_count       bigint,
  movement_count   bigint,
  production_count bigint,
  purchase_count   bigint,
  sales_count      bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spec       bigint := 0;
  v_move       bigint := 0;
  v_prod       bigint := 0;
  v_purchase   bigint := 0;
  v_sales      bigint := 0;
begin
  select count(*) into v_spec
    from public.skus where family_id = p_family;

  select count(*) into v_move
    from public.stock_movements m
    join public.skus s on s.id = m.sku_id
   where s.family_id = p_family;

  select count(*) into v_prod
    from public.stock_movements m
    join public.skus s on s.id = m.sku_id
   where s.family_id = p_family and m.type = 'production_output';

  -- Phase 2 tables (extend the joins here when they are introduced).
  if to_regclass('public.purchase_order_items') is not null then
    execute 'select count(*) from public.purchase_order_items i
               join public.skus s on s.id = i.sku_id
              where s.family_id = $1'
      into v_purchase using p_family;
  end if;

  if to_regclass('public.sales_order_items') is not null then
    execute 'select count(*) from public.sales_order_items i
               join public.skus s on s.id = i.sku_id
              where s.family_id = $1'
      into v_sales using p_family;
  end if;

  return query select v_spec, v_move, v_prod, v_purchase, v_sales;
end;
$$;

grant execute on function public.product_family_usage(uuid) to authenticated;
