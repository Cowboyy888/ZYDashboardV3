-- =============================================================================
-- Zysteel Operations — seed data
-- Runs after migrations on `supabase db reset`. Idempotent.
--   - Two editable locations: Storage Room, Warehouse
--   - Three editable product families: 钢筋网 / 螺纹盘圆 / 拔丝料
--   - The supplied example SKUs + opening stock (all into Storage Room)
--   - A few employees with Khmer / English / Chinese names
-- No auth users are seeded — create the first Owner via the app setup flow
-- (see docs/operations-runbook.md); the first signup becomes Owner.
-- =============================================================================

-- Session-local helpers to keep the seed DRY.
create or replace function pg_temp.seed_sku(
  p_fam uuid, p_dia text, p_size text, p_hole text, p_rod text,
  p_cond text, p_unit text, p_min numeric
) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.skus (family_id, diameter, size, hole, rod_count, condition, unit, minimum_level)
  values (p_fam, p_dia, p_size, p_hole, p_rod, p_cond, p_unit, p_min)
  on conflict do nothing;
  select id into v from public.skus
   where family_id = p_fam
     and coalesce(lower(diameter),'')  = coalesce(lower(p_dia),'')
     and coalesce(lower(size),'')      = coalesce(lower(p_size),'')
     and coalesce(lower(hole),'')      = coalesce(lower(p_hole),'')
     and coalesce(lower(rod_count),'') = coalesce(lower(p_rod),'')
     and coalesce(lower(extra),'')     = ''
     and condition = p_cond and lower(unit) = lower(p_unit);
  return v;
end $$;

create or replace function pg_temp.seed_opening(p_sku uuid, p_loc uuid, p_qty numeric)
returns void language plpgsql as $$
begin
  if p_sku is null then return; end if;
  if not exists (
    select 1 from public.stock_movements
    where sku_id = p_sku and location_id = p_loc and type = 'opening_balance'
  ) then
    insert into public.stock_movements (sku_id, location_id, type, quantity, business_date)
    values (p_sku, p_loc, 'opening_balance', p_qty, date '2026-07-01');
  end if;
end $$;

do $$
declare
  loc_storage uuid;
  fam_mesh uuid;  -- 钢筋网
  fam_wire uuid;  -- 拔丝料
  fam_coil uuid;  -- 螺纹盘圆
begin
  -- Locations -----------------------------------------------------------------
  insert into public.locations (code, name) values ('storage_room', 'Storage Room 仓房')
    on conflict (code) do nothing;
  insert into public.locations (code, name) values ('warehouse', 'Warehouse 仓库')
    on conflict (code) do nothing;
  select id into loc_storage from public.locations where code = 'storage_room';

  -- Product families ----------------------------------------------------------
  insert into public.product_families (code, name, default_unit) values ('gangjinwang', '钢筋网', '张')
    on conflict (code) do nothing;
  insert into public.product_families (code, name, default_unit) values ('luowenpanyuan', '螺纹盘圆', '捆')
    on conflict (code) do nothing;
  insert into public.product_families (code, name, default_unit) values ('basiliao', '拔丝料', '捆')
    on conflict (code) do nothing;
  select id into fam_mesh from public.product_families where code = 'gangjinwang';
  select id into fam_coil from public.product_families where code = 'luowenpanyuan';
  select id into fam_wire from public.product_families where code = 'basiliao';

  -- 拔丝料 (decimal 捆) --------------------------------------------------------
  perform pg_temp.seed_opening(pg_temp.seed_sku(fam_wire, '10厘', null, null, null, 'normal', '捆', 20), loc_storage, 10);
  perform pg_temp.seed_opening(pg_temp.seed_sku(fam_wire, '6厘',  null, null, null, 'normal', '捆', 20), loc_storage, 30.5);

  -- 钢筋网 (each attribute combo = a distinct SKU, unit 张) --------------------
  perform pg_temp.seed_opening(pg_temp.seed_sku(fam_mesh, '9厘',   '3×6', '20孔', null,   'normal',     '张', 100), loc_storage, 329);
  perform pg_temp.seed_opening(pg_temp.seed_sku(fam_mesh, '9厘',   '3×6', '20孔', null,   'old',        '张', 0),   loc_storage, 64);
  perform pg_temp.seed_opening(pg_temp.seed_sku(fam_mesh, '5.5厘', '3×6', '20孔', '15根', 'normal',     '张', 200), loc_storage, 903);
  perform pg_temp.seed_opening(pg_temp.seed_sku(fam_mesh, '5.5厘', '3×6', '20孔', '14根', 'rough_edge', '张', 0),   loc_storage, 146);
  perform pg_temp.seed_opening(pg_temp.seed_sku(fam_mesh, '3.3厘', '2×6', '20孔', null,   'normal',     '张', 200), loc_storage, 902);

  -- A configurable 螺纹盘圆 example spec (no opening stock) --------------------
  perform pg_temp.seed_sku(fam_coil, '6.5mm', null, null, null, 'normal', '捆', 0);
end $$;

-- Employees (non-sensitive). employee_code is assigned by the trigger from
-- seq_no → ZY-0001..ZY-0004. seq_no is given explicitly so the demo codes are
-- deterministic and the seed stays idempotent (conflict on employee_code).
insert into public.employees
  (seq_no, name_khmer, name_english, name_chinese, department, position, pay_type, start_date,
   attendance_group_id, display_name, job_title)
values
  (1, 'សុខ ដារ៉ា',   'Sok Dara',    '苏达拉', 'Production', 'Operator',   'daily',   date '2025-01-06',
    (select id from public.attendance_groups where name = '焊网机员工'), 'Sok Dara',    '焊网机员工'),
  (2, 'ចាន់ ធីតា',   'Chan Thida',  '陈提达', 'Warehouse',  'Storekeeper','daily', date '2024-11-01',
    (select id from public.attendance_groups where name = '采买配件房'), 'Chan Thida',  '配件采买'),
  (3, 'លី សុភா',     'Ly Sophea',   '李苏帕', 'Sales',      'Sales Rep',  'daily', date '2025-03-17',
    (select id from public.attendance_groups where name = '老板助理'), 'Ly Sophea',   '老板助理'),
  (4, 'ហេង វិចិត្រ', 'Heng Vichet', '亨维吉', 'Production', 'Operator',   'daily',   date '2025-05-02',
    (select id from public.attendance_groups where name = '调直机员工'), 'Heng Vichet', '调直机员工')
on conflict (employee_code) do nothing;

-- Advance the sequence past the seeded rows so the next created employee is ZY-0005.
select setval('public.employee_seq', greatest((select coalesce(max(seq_no), 0) from public.employees), 1));

-- Demonstration sensitive payroll rows (visible only to Owner/System/Payroll).
insert into public.employee_private (employee_id, daily_rate, emergency_contact)
select e.id, 18, '012 345 678'
from public.employees e
on conflict (employee_id) do nothing;

-- =============================================================================
-- Purchasing (Second pass): suppliers + sample purchase orders across every
-- status, so Suppliers / Purchase Orders / Goods Receiving / the Purchasing
-- dashboard all have something to show out of the box.
-- =============================================================================
insert into public.suppliers (name, name_chinese, contact_person, phone, default_currency, payment_terms)
select * from (values
  ('Guangzhou Steel Supply Co.', '广州钢材供应有限公司', 'Mr. Chen', '+86 138 0000 1111', 'CNY', 'Net 30'),
  ('Cambodia Metal Traders',      null,                    'Sokha',    '+855 12 345 678',    'USD', 'Net 15'),
  ('Sihanoukville Wire Ltd.',     null,                    'Dara',     '+855 11 222 333',    'KHR', 'Prepaid')
) as v(name, name_chinese, contact_person, phone, default_currency, payment_terms)
where not exists (select 1 from public.suppliers s where s.name = v.name);

do $$
declare
  sup_gz uuid;
  sup_kh uuid;
  sup_wire uuid;
  loc_storage uuid;
  loc_warehouse uuid;
  sku_mesh_normal uuid; -- 钢筋网 9厘|3×6|20孔|Normal
  sku_wire_10 uuid;     -- 拔丝料 10厘
  po_id uuid;
  item_id uuid;
begin
  select id into sup_gz   from public.suppliers where name = 'Guangzhou Steel Supply Co.';
  select id into sup_kh   from public.suppliers where name = 'Cambodia Metal Traders';
  select id into sup_wire from public.suppliers where name = 'Sihanoukville Wire Ltd.';
  select id into loc_storage   from public.locations where code = 'storage_room';
  select id into loc_warehouse from public.locations where code = 'warehouse';
  select id into sku_mesh_normal from public.skus
    where family_id = (select id from public.product_families where code = 'gangjinwang')
      and lower(diameter) = lower('9厘') and lower(size) = lower('3×6') and lower(hole) = lower('20孔')
      and coalesce(rod_count,'') = '' and condition = 'normal';
  select id into sku_wire_10 from public.skus
    where family_id = (select id from public.product_families where code = 'basiliao')
      and lower(diameter) = lower('10厘') and condition = 'normal';

  -- Skip entirely if this looks like a re-run against a non-empty table.
  if exists (select 1 from public.purchase_orders limit 1) then
    return;
  end if;

  -- 1) Draft — not yet issued.
  po_id := public.create_draft_purchase_order(
    sup_gz, date '2026-07-20', date '2026-08-05', 'CNY', 'Draft — awaiting confirmation', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_storage, 'unit', '张', 'orderedQty', 500, 'unitCost', 12.5)
    )
  );

  -- 2) Ordered, due within the next 7 days (shows in "expected this week" + Telegram).
  po_id := public.create_draft_purchase_order(
    sup_kh, date '2026-07-18', date '2026-07-30', 'USD', 'Regular restock', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_warehouse, 'unit', '张', 'orderedQty', 300, 'unitCost', 2.10)
    )
  );
  update public.purchase_orders set status = 'ordered', issued_at = now() where id = po_id;

  -- 3) Ordered, overdue (expected date already passed, nothing received yet).
  po_id := public.create_draft_purchase_order(
    sup_wire, date '2026-06-25', date '2026-07-10', 'KHR', 'Supplier confirmed late', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_wire_10, 'locationId', loc_storage, 'unit', '捆', 'orderedQty', 25, 'unitCost', 180000)
    )
  );
  update public.purchase_orders set status = 'ordered', issued_at = now() where id = po_id;

  -- 4) Partially received.
  po_id := public.create_draft_purchase_order(
    sup_gz, date '2026-07-10', date '2026-07-22', 'CNY', 'Split delivery expected', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_storage, 'unit', '张', 'orderedQty', 400, 'unitCost', 12.0)
    )
  );
  update public.purchase_orders set status = 'ordered', issued_at = now() where id = po_id;
  select id into item_id from public.purchase_order_items where purchase_order_id = po_id;
  insert into public.stock_movements (sku_id, location_id, type, quantity, business_date, purchase_order_item_id, batch_reference, notes)
  values (sku_mesh_normal, loc_storage, 'purchase_receipt', 150, date '2026-07-19', item_id, 'BATCH-001', 'First partial delivery');
  update public.purchase_orders set status = 'partially_received' where id = po_id;

  -- 5) Fully received.
  po_id := public.create_draft_purchase_order(
    sup_kh, date '2026-06-15', date '2026-06-28', 'USD', null, null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_wire_10, 'locationId', loc_warehouse, 'unit', '捆', 'orderedQty', 10, 'unitCost', 45.0)
    )
  );
  update public.purchase_orders set status = 'ordered', issued_at = now() where id = po_id;
  select id into item_id from public.purchase_order_items where purchase_order_id = po_id;
  insert into public.stock_movements (sku_id, location_id, type, quantity, business_date, purchase_order_item_id, batch_reference)
  values (sku_wire_10, loc_warehouse, 'purchase_receipt', 10, date '2026-06-27', item_id, 'BATCH-002');
  update public.purchase_orders set status = 'received' where id = po_id;

  -- 6) Cancelled.
  po_id := public.create_draft_purchase_order(
    sup_wire, date '2026-07-01', date '2026-07-15', 'USD', 'Supplier could not fulfil', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_storage, 'unit', '张', 'orderedQty', 100, 'unitCost', 13.0)
    )
  );
  update public.purchase_orders set status = 'cancelled', cancelled_at = now() where id = po_id;
end $$;

-- =============================================================================
-- Sales (Third pass): customers + sample sales orders across every status, so
-- Customers / Sales Orders / Delivery / the Sales dashboard all have something
-- to show out of the box.
-- =============================================================================
insert into public.customers (name, name_chinese, contact_person, phone, default_currency, payment_terms)
select * from (values
  ('Battambang Construction Ltd.', null,              'Sopheak',  '+855 12 987 654', 'USD', 'Net 30'),
  ('Phnom Penh Rebar Depot',        '金边钢筋仓库',     'Ms. Lim',  '+855 16 555 222', 'USD', 'Net 15'),
  ('Kampong Cham Traders',          null,              'Vibol',    '+855 17 444 111', 'KHR', 'Prepaid')
) as v(name, name_chinese, contact_person, phone, default_currency, payment_terms)
where not exists (select 1 from public.customers c where c.name = v.name);

do $$
declare
  cust_battambang uuid;
  cust_pp uuid;
  cust_kampong uuid;
  loc_storage uuid;
  loc_warehouse uuid;
  sku_mesh_normal uuid; -- 钢筋网 9厘|3×6|20孔|Normal
  sku_wire_10 uuid;     -- 拔丝料 10厘
  so_id uuid;
  item_id uuid;
begin
  select id into cust_battambang from public.customers where name = 'Battambang Construction Ltd.';
  select id into cust_pp         from public.customers where name = 'Phnom Penh Rebar Depot';
  select id into cust_kampong    from public.customers where name = 'Kampong Cham Traders';
  select id into loc_storage   from public.locations where code = 'storage_room';
  select id into loc_warehouse from public.locations where code = 'warehouse';
  select id into sku_mesh_normal from public.skus
    where family_id = (select id from public.product_families where code = 'gangjinwang')
      and lower(diameter) = lower('9厘') and lower(size) = lower('3×6') and lower(hole) = lower('20孔')
      and coalesce(rod_count,'') = '' and condition = 'normal';
  select id into sku_wire_10 from public.skus
    where family_id = (select id from public.product_families where code = 'basiliao')
      and lower(diameter) = lower('10厘') and condition = 'normal';

  -- Skip entirely if this looks like a re-run against a non-empty table.
  if exists (select 1 from public.sales_orders limit 1) then
    return;
  end if;

  -- 1) Draft — not yet confirmed.
  so_id := public.create_draft_sales_order(
    cust_pp, date '2026-07-26', date '2026-08-10', 'USD', 'Draft — awaiting confirmation', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_storage, 'unit', '张', 'orderedQty', 200, 'unitPrice', 3.20)
    )
  );

  -- 2) Confirmed, due within the next 7 days (shows in "due this week").
  so_id := public.create_draft_sales_order(
    cust_battambang, date '2026-07-24', date '2026-08-02', 'USD', 'Regular order', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_warehouse, 'unit', '张', 'orderedQty', 150, 'unitPrice', 3.50)
    )
  );
  update public.sales_orders set status = 'confirmed', confirmed_at = now() where id = so_id;

  -- 3) Confirmed, overdue (expected date already passed, nothing delivered yet).
  so_id := public.create_draft_sales_order(
    cust_kampong, date '2026-07-10', date '2026-07-20', 'KHR', 'Customer confirmed late pickup', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_wire_10, 'locationId', loc_storage, 'unit', '捆', 'orderedQty', 15, 'unitPrice', 210000)
    )
  );
  update public.sales_orders set status = 'confirmed', confirmed_at = now() where id = so_id;

  -- 4) Partially delivered.
  so_id := public.create_draft_sales_order(
    cust_pp, date '2026-07-15', date '2026-07-27', 'USD', 'Split delivery expected', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_storage, 'unit', '张', 'orderedQty', 300, 'unitPrice', 3.30)
    )
  );
  update public.sales_orders set status = 'confirmed', confirmed_at = now() where id = so_id;
  select id into item_id from public.sales_order_items where sales_order_id = so_id;
  insert into public.stock_movements (sku_id, location_id, type, quantity, business_date, sales_order_item_id, batch_reference, notes)
  values (sku_mesh_normal, loc_storage, 'sale_delivery', -120, date '2026-07-19', item_id, 'DO-001', 'First partial delivery');
  update public.sales_orders set status = 'partially_delivered' where id = so_id;

  -- 5) Fully delivered.
  so_id := public.create_draft_sales_order(
    cust_battambang, date '2026-06-15', date '2026-06-28', 'USD', null, null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_wire_10, 'locationId', loc_warehouse, 'unit', '捆', 'orderedQty', 8, 'unitPrice', 65.0)
    )
  );
  update public.sales_orders set status = 'confirmed', confirmed_at = now() where id = so_id;
  select id into item_id from public.sales_order_items where sales_order_id = so_id;
  insert into public.stock_movements (sku_id, location_id, type, quantity, business_date, sales_order_item_id, batch_reference)
  values (sku_wire_10, loc_warehouse, 'sale_delivery', -8, date '2026-06-27', item_id, 'DO-002');
  update public.sales_orders set status = 'delivered' where id = so_id;

  -- 6) Cancelled.
  so_id := public.create_draft_sales_order(
    cust_kampong, date '2026-07-05', date '2026-07-18', 'USD', 'Customer cancelled the order', null,
    jsonb_build_array(
      jsonb_build_object('skuId', sku_mesh_normal, 'locationId', loc_storage, 'unit', '张', 'orderedQty', 80, 'unitPrice', 3.40)
    )
  );
  update public.sales_orders set status = 'cancelled', cancelled_at = now() where id = so_id;
end $$;
