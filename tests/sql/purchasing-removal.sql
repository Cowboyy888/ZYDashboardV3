-- Post-migration assertions for an isolated PostgreSQL replay with historical
-- purchasing fixtures. Before applying the migration, capture stock_movements
-- and stock_balances as retirement_stock_before / retirement_balances_before.
-- Execute via psql -v ON_ERROR_STOP=1. Never run fixture setup in production.
begin;
do $$
declare
  t text;
  item public.audit_log%rowtype;
  sku public.skus%rowtype;
  loc uuid;
  usage record;
begin
  foreach t in array array['suppliers','purchase_orders','purchase_order_items',
    'purchase_order_manual_items','purchase_order_seq'] loop
    if to_regclass('public.' || t) is not null then
      raise exception 'Purchasing table still exists: %', t;
    end if;
  end loop;
  if to_regprocedure('public.create_draft_purchase_order(uuid,date,date,text,text,text,jsonb)') is not null
    or to_regprocedure('public.post_purchase_receipt(uuid,numeric,date,text,text,text,text)') is not null then
    raise exception 'Purchasing RPC still exists';
  end if;
  if exists ((select * from public.stock_movements except select * from retirement_stock_before)
    union all (select * from retirement_stock_before except select * from public.stock_movements)) then
    raise exception 'Stock history changed';
  end if;
  if exists ((select * from public.stock_balances except select * from retirement_balances_before)
    union all (select * from retirement_balances_before except select * from public.stock_balances)) then
    raise exception 'Stock balances changed';
  end if;
  foreach t in array array['suppliers','purchase_orders','purchase_order_items','purchase_order_manual_items'] loop
    if not exists (select 1 from public.audit_log where action = 'purchasing.retired' and entity = t) then
      raise exception 'Missing source snapshot: %', t;
    end if;
  end loop;
  select * into strict item from public.audit_log where action = 'purchasing.retired'
    and entity = 'purchase_order_items' limit 1;
  select * into strict sku from public.skus where id::text = item.old_value->>'sku_id';
  loc := (item.old_value->>'location_id')::uuid;
  select * into usage from public.product_family_usage(sku.family_id);
  if usage.purchase_count < 1 then raise exception 'Historical family usage lost'; end if;
  begin
    insert into public.stock_movements(sku_id,location_id,type,quantity,business_date)
      values (sku.id,loc,'purchase_receipt',1,'2026-10-29');
    raise exception 'New purchase receipt unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm not like 'PURCHASING_REMOVED:%' then raise; end if;
  end;
  begin
    insert into public.stock_movements(sku_id,location_id,type,quantity,business_date,purchase_order_item_id)
      values (sku.id,loc,'production_output',1,'2026-10-29',item.entity_id::uuid);
    raise exception 'New purchase-item link unexpectedly accepted';
  exception when raise_exception then
    if sqlerrm not like 'PURCHASING_REMOVED:%' then raise; end if;
  end;
  insert into public.stock_movements(sku_id,location_id,type,quantity,business_date)
    values (sku.id,loc,'production_output',1,'2026-10-29');
  begin
    update public.audit_log set new_value = '{}' where id = item.id;
    raise exception 'Audit snapshot unexpectedly mutable';
  exception when raise_exception then
    if sqlerrm not like 'UPDATE_FORBIDDEN:%' then raise; end if;
  end;
end $$;
rollback;

-- Verify historical SKU-delete guard and snapshot RLS under real DB roles.
begin;
insert into auth.users(id,email,raw_user_meta_data) values
  ('20000000-0000-4000-8000-000000000001','retirement-owner@example.invalid','{}'),
  ('20000000-0000-4000-8000-000000000002','retirement-viewer@example.invalid','{}');
update public.profiles set role='owner' where id='20000000-0000-4000-8000-000000000001';
update public.profiles set role='viewer' where id='20000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
do $$
declare v_sku uuid;
begin
  select (old_value->>'sku_id')::uuid into strict v_sku from public.audit_log
    where action='purchasing.retired' and entity='purchase_order_items' limit 1;
  update public.skus set is_active=false where id=v_sku;
  begin
    perform public.delete_archived_sku_if_empty(v_sku);
    raise exception 'Historical purchase SKU unexpectedly deleted';
  exception when raise_exception then
    if sqlerrm not like '%purchase order history%' then raise; end if;
  end;
end $$;
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.audit_log where action='purchasing.retired') then
    raise exception 'Owner cannot read source snapshots';
  end if;
end $$;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists(select 1 from public.audit_log where action='purchasing.retired') then
    raise exception 'Viewer can read purchasing source snapshots';
  end if;
end $$;
rollback;
