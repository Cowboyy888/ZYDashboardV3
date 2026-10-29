-- Retire Purchasing. Preserve source records in the existing restricted,
-- append-only audit log before dropping operational tables. No ledger rows or
-- balances are changed. Historical migration files stay unchanged.
begin;

-- Prevent concurrent writes between the snapshot and removal.
lock table public.suppliers, public.purchase_orders, public.purchase_order_items,
  public.purchase_order_manual_items, public.purchase_order_seq,
  public.stock_movements in access exclusive mode;

insert into public.audit_log (actor_email, action, entity, entity_id, old_value, new_value)
select 'migration:remove_purchasing', 'purchasing.retired', 'suppliers', id::text,
  to_jsonb(t), '{"removed": true}'::jsonb from public.suppliers t;

insert into public.audit_log (actor_email, action, entity, entity_id, old_value, new_value)
select 'migration:remove_purchasing', 'purchasing.retired', 'purchase_orders', id::text,
  to_jsonb(t), '{"removed": true}'::jsonb from public.purchase_orders t;

insert into public.audit_log (actor_email, action, entity, entity_id, old_value, new_value)
select 'migration:remove_purchasing', 'purchasing.retired', 'purchase_order_items', id::text,
  to_jsonb(t), '{"removed": true}'::jsonb from public.purchase_order_items t;

insert into public.audit_log (actor_email, action, entity, entity_id, old_value, new_value)
select 'migration:remove_purchasing', 'purchasing.retired', 'purchase_order_manual_items', id::text,
  to_jsonb(t), '{"removed": true}'::jsonb from public.purchase_order_manual_items t;

-- Retain historical IDs for lookup via audit_log.entity/entity_id. Removing
-- only the FK avoids rewriting immutable stock movements.
drop trigger if exists trg_enforce_purchase_receipt_rules on public.stock_movements;
drop view if exists public.purchase_order_item_received;
alter table public.stock_movements
  drop constraint if exists stock_movements_purchase_order_item_id_fkey;

drop function if exists public.create_draft_purchase_order(uuid, date, date, text, text, text, jsonb);
drop function if exists public.post_purchase_receipt(uuid, numeric, date, text, text, text, text);
drop table public.purchase_order_manual_items;
drop table public.purchase_order_items;
drop table public.purchase_orders;
drop table public.suppliers;
drop table public.purchase_order_seq;
drop function if exists public.assign_po_number();
drop function if exists public.enforce_po_header_immutable();
drop function if exists public.enforce_po_item_immutable();
drop function if exists public.enforce_purchase_receipt_rules();

-- Existing purchase_receipt rows remain valid history; new receipts or new
-- links to retired purchase items must never be inserted, even via the API.
create function public.prevent_retired_purchase_receipt()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.type = 'purchase_receipt' or new.purchase_order_item_id is not null then
    raise exception 'PURCHASING_REMOVED: new purchase receipts are disabled';
  end if;
  return new;
end $$;
revoke all on function public.prevent_retired_purchase_receipt() from public, anon, authenticated;
create trigger trg_prevent_retired_purchase_receipt
  before insert on public.stock_movements
  for each row execute function public.prevent_retired_purchase_receipt();

create index audit_retired_purchase_sku_idx
  on public.audit_log ((old_value->>'sku_id'))
  where action = 'purchasing.retired' and entity = 'purchase_order_items';

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

  if exists (select 1 from public.audit_log where action = 'purchasing.retired'
    and entity = 'purchase_order_items' and old_value->>'sku_id' = p_sku::text) then
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

  -- Historical purchase counts remain traceable after the tables are removed.
  select count(*) into v_purchase from public.audit_log a
    join public.skus s on s.id::text = a.old_value->>'sku_id'
    where a.action = 'purchasing.retired' and a.entity = 'purchase_order_items'
      and s.family_id = p_family;

  if to_regclass('public.sales_order_items') is not null then
    execute 'select count(*) from public.sales_order_items i
               join public.skus s on s.id = i.sku_id
              where s.family_id = $1'
      into v_sales using p_family;
  end if;

  return query select v_spec, v_move, v_prod, v_purchase, v_sales;
end;
$$;


commit;
