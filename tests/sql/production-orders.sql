-- Disposable migrated PostgreSQL/Supabase only. All fixtures roll back.
begin;
create temporary table p4_fixture as select
  gen_random_uuid() owner_id,gen_random_uuid() warehouse_id,gen_random_uuid() viewer_id,
  gen_random_uuid() customer_id,gen_random_uuid() family_id,gen_random_uuid() sku_id,
  gen_random_uuid() location_id,gen_random_uuid() so_id,gen_random_uuid() item_id,
  gen_random_uuid() drawing_id,gen_random_uuid() internal_id,gen_random_uuid() source_id,gen_random_uuid() bad_drawing_id;
grant select on p4_fixture to authenticated;
insert into auth.users(id,email) select owner_id,'p4-owner@example.invalid' from p4_fixture;
insert into auth.users(id,email) select warehouse_id,'p4-warehouse@example.invalid' from p4_fixture;
insert into auth.users(id,email) select viewer_id,'p4-viewer@example.invalid' from p4_fixture;
update public.profiles set role='owner' where id=(select owner_id from p4_fixture);
update public.profiles set role='warehouse_admin' where id=(select warehouse_id from p4_fixture);
update public.profiles set role='viewer' where id=(select viewer_id from p4_fixture);
insert into public.customers(id,name) select customer_id,'P4 customer' from p4_fixture;
insert into public.product_families(id,code,name,default_unit) select family_id,'p4-mesh','钢筋网','张' from p4_fixture;
insert into public.skus(id,family_id,diameter,size,hole,condition,unit)
  select sku_id,family_id,'5.5','2.4×6','200×200','normal','张' from p4_fixture;
insert into public.locations(id,code,name) select location_id,'p4-loc','P4 location' from p4_fixture;
insert into public.stock_movements(sku_id,location_id,type,quantity,business_date)
  select sku_id,location_id,'opening_balance',5,'2026-10-30' from p4_fixture;
insert into public.sales_orders(id,customer_id,currency) select so_id,customer_id,'USD' from p4_fixture;
insert into public.sales_order_items(id,sales_order_id,sku_id,location_id,unit,ordered_qty,unit_price)
  select item_id,so_id,sku_id,location_id,'张',100,2 from p4_fixture;
update public.sales_orders set status='confirmed' where id=(select so_id from p4_fixture);
insert into public.wire_mesh_drawings(id,sales_order_id,customer_name,mesh_specification,wire_diameter_mm,
  sheet_length_mm,sheet_width_mm,length_spacing_mm,width_spacing_mm,quantity)
  select drawing_id,so_id,'P4 customer','P4 mesh',5.5,6000,2400,200,200,10 from p4_fixture;
insert into public.wire_mesh_drawings(id,sales_order_id,customer_name,mesh_specification,wire_diameter_mm,
  sheet_length_mm,sheet_width_mm,length_spacing_mm,width_spacing_mm,quantity)
  select bad_drawing_id,so_id,'P4 customer','Invalid exact fit',5.5,6000,2400,260,200,10 from p4_fixture;

create function pg_temp.expect_p4_error(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement; raise exception 'EXPECTED_ERROR_NOT_RAISED';
  exception when others then
    if sqlerrm not like '%' || expected || '%' then raise; end if;
  end;
end $$;
grant execute on function pg_temp.expect_p4_error(text,text) to authenticated;
select set_config('request.jwt.claims',json_build_object('sub',warehouse_id)::text,true) from p4_fixture;
set local role authenticated;
do $$ declare f record; payload jsonb; n int; begin
  select * into f from pg_temp.p4_fixture;
  payload:=jsonb_build_object('business_date','2026-10-30','sku_id',f.sku_id,'drawing_id',f.drawing_id,
    'planned_quantity',10,'required_date','2026-11-04','priority','normal','internal_reason','Replenishment');
  perform pg_temp.expect_p4_error(format('select public.create_production_order(%L,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('drawing_id',f.bad_drawing_id)),'PRODUCTION_GEOMETRY_INVALID');
  perform pg_temp.expect_p4_error(format('select public.create_production_order(%L,%L::jsonb)',gen_random_uuid(),payload||jsonb_build_object('sku_id',gen_random_uuid())),'PRODUCTION_SKU_INVALID');
  perform public.create_production_order(f.internal_id,payload);
  perform public.create_production_order(f.internal_id,payload);
  if (select count(*) from public.production_orders where id=f.internal_id) <> 1 then raise exception 'retry duplicated plan'; end if;
  if (select count(*) from public.audit_log where entity_id=f.internal_id::text) <> 0 then
    raise exception 'warehouse can read audit log';
  end if;
  perform pg_temp.expect_p4_error(format('select public.create_production_order(%L,%L::jsonb)',f.internal_id,payload||'{"planned_quantity":11}'), 'PRODUCTION_REQUEST_CONFLICT');
  update public.production_orders set planned_quantity=12 where id=f.internal_id and version=1;
  if (select version from public.production_orders where id=f.internal_id) <> 2 then raise exception 'revision not incremented'; end if;
  perform pg_temp.expect_p4_error(format('update public.production_orders set status=''approved'' where id=%L',f.internal_id),'PRODUCTION_APPROVE_OWNER_ONLY');
  perform pg_temp.expect_p4_error(format('update public.production_orders set status=''on_hold'' where id=%L',f.internal_id),'PRODUCTION_REASON_REQUIRED');
  if (select count(*) from public.sales_order_items) <> 0 then raise exception 'warehouse can read commercial prices'; end if;
  if public.production_reference_options('sales_items')::text like '%unit_price%' then raise exception 'price leaked'; end if;
  if jsonb_array_length(public.production_reference_options('sales_items')) <> 1 then raise exception 'source lookup missing'; end if;
  payload := payload - 'internal_reason' || jsonb_build_object('sales_order_item_id',f.item_id);
  perform pg_temp.expect_p4_error(format('select public.create_production_order(%L,%L::jsonb)',gen_random_uuid(),payload||'{"planned_quantity":101}'),'PRODUCTION_EXCEEDS_OUTSTANDING');
  perform public.create_production_order(f.source_id,payload);
  perform pg_temp.expect_p4_error(format('select public.create_production_order(%L,%L::jsonb)',gen_random_uuid(),payload),'production_orders_one_active_sales_item');
end $$;
reset role;
-- The audit write is in the same database transaction as the planning mutation.
do $$ declare f record; begin
  select * into f from pg_temp.p4_fixture;
  if (select count(*) from public.audit_log where entity_id=f.internal_id::text) <> 2 then raise exception 'create/retry/edit audit count wrong'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',owner_id)::text,true) from p4_fixture;
set local role authenticated;
do $$ declare f record; begin
  select * into f from pg_temp.p4_fixture;
  perform pg_temp.expect_p4_error(format('update public.production_orders set status=''approved'',planned_quantity=50 where id=%L',f.internal_id),'PRODUCTION_LOCKED');
end $$;
update public.production_orders set status='approved' where id=(select internal_id from p4_fixture);
update public.production_orders set status='approved' where id=(select source_id from p4_fixture);
do $$ declare f record; begin
  select * into f from pg_temp.p4_fixture;
  perform pg_temp.expect_p4_error(format('update public.production_orders set planned_quantity=50 where id=%L',f.internal_id),'PRODUCTION_LOCKED');
  if (select approved_by from public.production_orders where id=f.internal_id) <> f.owner_id then raise exception 'approval attribution wrong'; end if;
end $$;
reset role;
update public.customers set name='P4 customer renamed' where id=(select customer_id from p4_fixture);
set local role authenticated;
update public.production_orders set status='on_hold',status_reason='Review saved customer reference' where id=(select source_id from p4_fixture);
update public.production_orders set status='approved' where id=(select source_id from p4_fixture);
do $$ begin
  if (select customer_reference from public.production_orders where id=(select source_id from p4_fixture)) <> 'P4 customer' then raise exception 'approved reference drifted on resume'; end if;
end $$;
reset role;
update public.wire_mesh_drawings set wire_diameter_mm=7 where id=(select drawing_id from p4_fixture);
do $$ begin
  if (select (geometry->>'wireDiameterMm')::numeric from public.production_orders where id=(select internal_id from p4_fixture)) <> 5.5 then raise exception 'approved geometry drifted'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',warehouse_id)::text,true) from p4_fixture;
set local role authenticated;
update public.production_orders set status='on_hold',status_reason='Machine unavailable' where id=(select internal_id from p4_fixture);
do $$ declare f record; begin
  select * into f from pg_temp.p4_fixture;
  if (select held_from_status from public.production_orders where id=f.internal_id) <> 'approved' then raise exception 'hold origin lost'; end if;
  perform pg_temp.expect_p4_error(format('update public.production_orders set status=''approved'' where id=%L',f.internal_id),'PRODUCTION_APPROVE_OWNER_ONLY');
end $$;
update public.production_orders set status='cancelled',status_reason='Plan withdrawn' where id=(select internal_id from p4_fixture);
update public.production_orders set status='on_hold',status_reason='Await customer decision' where id=(select source_id from p4_fixture);
do $$ declare f record; begin
  select * into f from pg_temp.p4_fixture;
  perform pg_temp.expect_p4_error(format('update public.production_orders set status=''draft'' where id=%L',f.internal_id),'PRODUCTION_TRANSITION');
end $$;
reset role;
update public.sales_orders set status='cancelled' where id=(select so_id from p4_fixture);
select set_config('request.jwt.claims',json_build_object('sub',owner_id)::text,true) from p4_fixture;
set local role authenticated;
do $$ declare f record; begin
  select * into f from pg_temp.p4_fixture;
  perform pg_temp.expect_p4_error(format('update public.production_orders set status=''approved'' where id=%L',f.source_id),'PRODUCTION_SOURCE_INVALID');
end $$;
update public.production_orders set status='cancelled',status_reason='Customer cancelled' where id=(select source_id from p4_fixture);
reset role;
-- Even a privileged delete must hit the no-delete trigger.
select pg_temp.expect_p4_error('delete from public.production_orders','DELETE_FORBIDDEN');
do $$ begin
  if (select count(*) from public.stock_movements) <> 1 or (select sum(quantity) from public.stock_movements) <> 5 then
    raise exception 'planning changed stock'; end if;
  if exists(select 1 from public.audit_log where entity='production_orders' and (new_value ? 'base_salary' or new_value ? 'unit_price')) then raise exception 'private value in audit'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',viewer_id)::text,true) from p4_fixture;
set local role authenticated;
do $$ begin
  if (select count(*) from public.production_orders) <> 0 then raise exception 'viewer can read production'; end if;
  perform pg_temp.expect_p4_error('select public.production_reference_options(''supervisors'')','PRODUCTION_FORBIDDEN');
end $$;
reset role;
-- Check every app role against the effective new policies, not SQL text alone.
do $$ declare f record; r text; n int; begin
  select * into f from pg_temp.p4_fixture;
  foreach r in array array['owner','system_admin','warehouse_admin','sales_admin','attendance_admin','payroll_admin','marketing_admin','viewer'] loop
    update public.profiles set role=r::public.app_role where id=f.viewer_id;
    perform set_config('request.jwt.claims',json_build_object('sub',f.viewer_id)::text,true);
    execute 'set local role authenticated';
    select count(*) into n from public.production_orders;
    if (n > 0) <> (r in ('owner','system_admin','warehouse_admin','sales_admin')) then raise exception 'production read parity: %',r; end if;
    if r in ('owner','warehouse_admin') then perform public.production_reference_options('skus');
    else perform pg_temp.expect_p4_error('select public.production_reference_options(''skus'')','PRODUCTION_FORBIDDEN'); end if;
    execute 'reset role';
  end loop;
end $$;
do $$ begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where (n.nspname='production_private' or (n.nspname='public' and p.proname in ('create_production_order','production_reference_options')))
      and has_function_privilege('anon',p.oid,'execute')) then raise exception 'anonymous production RPC grant'; end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('create_production_order','production_reference_options') and p.prosecdef) then
    raise exception 'public definer production RPC'; end if;
end $$;
-- A failed audit insert must roll back the corresponding plan mutation.
select set_config('request.jwt.claims',json_build_object('sub',owner_id)::text,true) from p4_fixture;
set local role authenticated;
select public.create_production_order('90000000-0000-4000-8000-000000000001',
  jsonb_build_object('business_date','2026-10-30','sku_id',sku_id,'drawing_id',drawing_id,
  'planned_quantity',1,'required_date','2026-11-04','priority','normal','internal_reason','Audit rollback probe')) from p4_fixture;
reset role;
create function pg_temp.reject_production_audit() returns trigger language plpgsql as $$ begin
  if new.action='production_order.update' and new.entity_id='90000000-0000-4000-8000-000000000001' then raise exception 'P4_AUDIT_TEST_FAILURE'; end if;
  return new;
end $$;
create trigger p4_fail_audit before insert on public.audit_log for each row execute function pg_temp.reject_production_audit();
set local role authenticated;
select pg_temp.expect_p4_error('update public.production_orders set notes=''must roll back'' where id=''90000000-0000-4000-8000-000000000001''','P4_AUDIT_TEST_FAILURE');
do $$ begin
  if (select version from public.production_orders where id='90000000-0000-4000-8000-000000000001') <> 1 then raise exception 'failed audit committed plan'; end if;
end $$;
reset role;
drop trigger p4_fail_audit on public.audit_log;
-- Anonymous callers cannot execute either public planning RPC.
set local role anon;
do $$ begin
  perform pg_temp.expect_p4_error('select public.production_reference_options(''skus'')','permission denied');
end $$;
reset role;
rollback;
