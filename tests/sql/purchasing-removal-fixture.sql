-- Run only in isolated temporary PostgreSQL for migration verification.
insert into public.suppliers(id,name) values ('10000000-0000-4000-8000-000000000001','Retirement fixture');
insert into public.purchase_orders(id,supplier_id,currency) values
 ('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','USD');
insert into public.purchase_order_items(id,purchase_order_id,sku_id,location_id,unit,ordered_qty,unit_cost)
 select '10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002',s.id,l.id,s.unit,5,10
 from public.skus s cross join public.locations l limit 1;
insert into public.purchase_order_manual_items(purchase_order_id,product_name,quantity,unit_price)
 values ('10000000-0000-4000-8000-000000000002','Manual fixture',5,10);
update public.purchase_orders set status='ordered' where id='10000000-0000-4000-8000-000000000002';
insert into public.stock_movements(sku_id,location_id,type,quantity,business_date,purchase_order_item_id)
 select sku_id,location_id,'purchase_receipt',5,'2026-10-29',id from public.purchase_order_items;
create table retirement_stock_before as select * from public.stock_movements;
create table retirement_balances_before as select * from public.stock_balances;
