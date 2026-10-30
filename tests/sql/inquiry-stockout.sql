-- Disposable migrated database only. Every fixture is rolled back.
begin;
select gen_random_uuid() as actor_id, gen_random_uuid() as customer_id \gset
insert into auth.users (id, email) values (:'actor_id', 'stockout-probe@example.invalid');
update public.profiles set role = 'sales_admin' where id = :'actor_id';
insert into public.customers (id, name) values (:'customer_id', 'Stockout probe');
create temporary table stockout_ledger_before as select count(*) as n from public.stock_movements;
grant select on stockout_ledger_before to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'actor_id')::text, true);

insert into public.inquiry_loss_reasons (code, name)
values ('stock_unavailable', 'Product unavailable / 产品缺货') on conflict (code) do nothing;
insert into public.inquiry_loss_reasons (code, name)
values ('stock_unavailable', 'must not overwrite') on conflict (code) do nothing;
select id as reason_id from public.inquiry_loss_reasons where code = 'stock_unavailable' \gset
insert into public.sales_inquiries
  (customer_id, customer_name, diameter, sheet_size, mesh_opening, quantity, loss_reason_id, created_by)
values (:'customer_id', 'Stockout probe', '5.5', '2.4×6', '200×200', 100, :'reason_id', :'actor_id')
returning id as inquiry_id \gset
update public.sales_inquiries set quantity = 120 where id = :'inquiry_id';
do $$ begin
  if (select count(*) from public.inquiry_loss_reasons where code = 'stock_unavailable') <> 1 then
    raise exception 'duplicate stockout reason';
  end if;
  if (select name from public.inquiry_loss_reasons where code = 'stock_unavailable') <> 'Product unavailable / 产品缺货' then
    raise exception 'lookup overwritten';
  end if;
  if (select count(*) from public.sales_inquiries where customer_name = 'Stockout probe' and quantity = 120) <> 1 then
    raise exception 'inquiry revision duplicated or missing';
  end if;
  if (select count(*) from public.stock_movements) <> (select n from stockout_ledger_before) then
    raise exception 'stock ledger changed';
  end if;
end $$;

reset role;
update public.profiles set role = 'marketing_admin' where id = :'actor_id';
set local role authenticated;
do $$ begin
  if (select count(*) from public.inquiry_loss_reasons) <> 0 then raise exception 'marketing can read loss reasons'; end if;
  begin
    insert into public.inquiry_loss_reasons (code, name) values ('unauthorized_probe', 'forbidden');
    raise exception 'marketing can insert loss reasons';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
