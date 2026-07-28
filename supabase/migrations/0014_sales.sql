-- =============================================================================
-- Zysteel Operations — 0014 Sales (Third pass)
-- Customers, Sales Orders, Sales Order Items, and delivery (stock-out).
--
-- Design notes (mirrors 0013_purchasing.sql's shape exactly, sales-side):
--   - Delivered/outstanding quantity is NEVER stored — like stock itself, it is
--     always derived from the append-only stock_movements ledger (view
--     sales_order_item_delivered). Only `sales_orders.status` is a stored,
--     recomputed-on-delivery convenience field.
--   - Delivery posts a normal `sale_delivery` stock_movements row (the type
--     already existed in the ledger check constraint), linked back to its
--     sales_order_item via a new nullable column. `sale_delivery` is stored as
--     a NEGATIVE quantity (existing sign-check constraint), so this file sums
--     `-quantity` wherever purchasing's mirror summed `quantity` directly.
--   - Over-delivery and negative-stock use the exact same shape of guard:
--     blocked unless an Owner override with a recorded reason is present,
--     enforced by a BEFORE INSERT trigger as the ultimate authority.
--   - sales_order_items is named to match the forward-compatible
--     `product_family_usage()` helper added in 0009, which already probes for
--     `public.sales_order_items`.
-- =============================================================================

-- --- Customers (editable master data) -----------------------------------------
create table if not exists public.customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  name_chinese      text,
  name_english      text,
  contact_person    text,
  phone             text,
  address           text,
  tax_id            text,
  payment_terms     text,
  default_currency  text not null default 'USD' check (default_currency in ('USD', 'KHR', 'CNY')),
  notes             text,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- --- Sales orders ---------------------------------------------------------------
create table if not exists public.sales_orders (
  id                      uuid primary key default gen_random_uuid(),
  so_number               text unique,
  customer_id             uuid not null references public.customers(id) on delete restrict,
  order_date              date not null default current_date,
  expected_delivery_date  date,
  currency                text not null check (currency in ('USD', 'KHR', 'CNY')),
  status                  text not null default 'draft'
                          check (status in ('draft', 'confirmed', 'partially_delivered', 'delivered', 'cancelled')),
  notes                   text,
  attachment_path         text,
  created_by              uuid references public.profiles(id) on delete set null,
  confirmed_at            timestamptz,
  cancelled_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists sales_orders_status_idx on public.sales_orders (status);
create index if not exists sales_orders_expected_idx on public.sales_orders (expected_delivery_date);
create index if not exists sales_orders_customer_idx on public.sales_orders (customer_id);

-- --- Sales order items (one row per SKU line on a SO) --------------------------
-- `unit` is copied from the SKU at insert time (never user-chosen) so a sale
-- can never silently use a different unit than the stock ledger — there is no
-- conversion path to get wrong.
create table if not exists public.sales_order_items (
  id                uuid primary key default gen_random_uuid(),
  sales_order_id    uuid not null references public.sales_orders(id) on delete cascade,
  sku_id            uuid not null references public.skus(id) on delete restrict,
  location_id       uuid not null references public.locations(id) on delete restrict,
  unit              text not null,
  ordered_qty       numeric(14, 3) not null check (ordered_qty > 0),
  unit_price        numeric(14, 4) not null check (unit_price >= 0),
  line_total        numeric(16, 4) generated always as (ordered_qty * unit_price) stored,
  created_at        timestamptz not null default now()
);
create index if not exists so_items_so_idx on public.sales_order_items (sales_order_id);
create index if not exists so_items_sku_idx on public.sales_order_items (sku_id);

-- --- Link stock_movements back to the SO item it fulfils -----------------------
alter table public.stock_movements
  add column if not exists sales_order_item_id uuid references public.sales_order_items(id) on delete restrict;
create index if not exists stock_movements_so_item_idx on public.stock_movements (sales_order_item_id);

-- Delivered quantity per item, derived from the ledger — never stored/edited.
-- sale_delivery rows are stored NEGATIVE (sign-check constraint), so this sums
-- -quantity to report a positive delivered_qty, mirroring received_qty's shape.
create or replace view public.sales_order_item_delivered
  with (security_invoker = on) as
  select sales_order_item_id as item_id, sum(-quantity)::numeric(14, 3) as delivered_qty
  from public.stock_movements
  where type = 'sale_delivery' and sales_order_item_id is not null
  group by sales_order_item_id;

-- --- SO number: SO-YYYY-####, atomic, resets per calendar year -----------------
create table if not exists public.sales_order_seq (
  year      int primary key,
  next_seq  int not null default 1
);

create or replace function public.assign_so_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from coalesce(new.order_date, current_date))::int;
  n int;
begin
  if new.so_number is null or length(btrim(new.so_number)) = 0 then
    insert into public.sales_order_seq (year, next_seq) values (y, 1)
      on conflict (year) do update set next_seq = public.sales_order_seq.next_seq + 1
      returning next_seq into n;
    new.so_number := 'SO-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_so_number on public.sales_orders;
create trigger trg_assign_so_number
  before insert on public.sales_orders
  for each row execute function public.assign_so_number();

-- --- SO header: lock commercial terms once confirmed (status <> draft) ---------
-- expected_delivery_date / notes / attachment_path / status remain editable —
-- delivery dates routinely slip after a sales order is confirmed.
create or replace function public.enforce_so_header_immutable()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from 'draft' then
    if new.customer_id is distinct from old.customer_id
       or new.currency is distinct from old.currency
       or new.order_date is distinct from old.order_date then
      raise exception 'SO_HEADER_LOCKED: customer/currency/order date cannot change once the sales order is confirmed';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_so_header_guard on public.sales_orders;
create trigger trg_so_header_guard
  before update on public.sales_orders
  for each row execute function public.enforce_so_header_immutable();

-- --- SO items: freely editable while draft, immutable once confirmed -----------
create or replace function public.enforce_so_item_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  so_status text;
begin
  select status into so_status from public.sales_orders
    where id = coalesce(new.sales_order_id, old.sales_order_id);
  if so_status is distinct from 'draft' then
    raise exception 'SO_ITEM_LOCKED: sales order items cannot be changed once the sales order is confirmed';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_so_items_no_update on public.sales_order_items;
create trigger trg_so_items_no_update
  before update on public.sales_order_items
  for each row execute function public.enforce_so_item_immutable();
drop trigger if exists trg_so_items_no_delete on public.sales_order_items;
create trigger trg_so_items_no_delete
  before delete on public.sales_order_items
  for each row execute function public.enforce_so_item_immutable();

-- --- Delivery guard: no draft/cancelled delivery; over-delivery needs Owner ----
create or replace function public.enforce_sale_delivery_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  so_status         text;
  ordered           numeric;
  already_delivered numeric;
  actor_role        app_role;
begin
  if new.type <> 'sale_delivery' or new.sales_order_item_id is null then
    return new;
  end if;

  select so.status, soi.ordered_qty
    into so_status, ordered
    from public.sales_order_items soi
    join public.sales_orders so on so.id = soi.sales_order_id
    where soi.id = new.sales_order_item_id;

  if so_status is null then
    raise exception 'SO_ITEM_NOT_FOUND: sales order item % not found', new.sales_order_item_id;
  end if;
  if so_status = 'cancelled' then
    raise exception 'CANCELLED_SO_BLOCKED: cannot deliver stock against a cancelled sales order';
  end if;
  if so_status = 'draft' then
    raise exception 'DRAFT_SO_BLOCKED: sales order must be confirmed before it can be delivered';
  end if;

  select coalesce(sum(-quantity), 0) into already_delivered
    from public.stock_movements
    where sales_order_item_id = new.sales_order_item_id and type = 'sale_delivery';

  if (already_delivered + (-new.quantity)) > ordered then
    if new.override_reason is null or length(btrim(new.override_reason)) = 0 then
      raise exception
        'OVER_DELIVERY_BLOCKED: delivering % would exceed the ordered quantity % (already delivered %); an Owner override with a recorded reason is required',
        -new.quantity, ordered, already_delivered;
    end if;
    actor_role := public.auth_role();
    if actor_role is distinct from 'owner' then
      raise exception 'OVER_DELIVERY_OVERRIDE_FORBIDDEN: only an Owner may override an over-delivery';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_sale_delivery_rules on public.stock_movements;
create trigger trg_enforce_sale_delivery_rules
  before insert on public.stock_movements
  for each row execute function public.enforce_sale_delivery_rules();

-- --- Atomic "create draft SO with items" RPC ------------------------------------
-- SECURITY INVOKER: RLS on sales_orders/sales_order_items still governs who
-- may call this.
create or replace function public.create_draft_sales_order(
  p_customer_id uuid,
  p_order_date date,
  p_expected_delivery_date date,
  p_currency text,
  p_notes text,
  p_attachment_path text,
  p_items jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_so_id uuid;
  item jsonb;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'A sales order needs at least one line item';
  end if;

  insert into public.sales_orders (
    customer_id, order_date, expected_delivery_date, currency, notes, attachment_path, created_by
  ) values (
    p_customer_id, p_order_date, p_expected_delivery_date, p_currency, p_notes, p_attachment_path, auth.uid()
  ) returning id into v_so_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.sales_order_items (
      sales_order_id, sku_id, location_id, unit, ordered_qty, unit_price
    ) values (
      v_so_id,
      (item->>'skuId')::uuid,
      (item->>'locationId')::uuid,
      item->>'unit',
      (item->>'orderedQty')::numeric,
      (item->>'unitPrice')::numeric
    );
  end loop;

  return v_so_id;
end $$;

-- --- Atomic "deliver goods against a SO item" RPC -------------------------------
-- Inserts the sale_delivery movement (guarded by the trigger above, negative
-- sign applied here) then recomputes sales_orders.status from the ledger
-- across ALL items.
create or replace function public.post_sale_delivery(
  p_item_id uuid,
  p_qty numeric,
  p_business_date date,
  p_notes text default null,
  p_attachment_path text default null,
  p_batch_reference text default null,
  p_override_reason text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_sku_id uuid;
  v_location_id uuid;
  v_so_id uuid;
  v_movement_id uuid;
  v_ordered_total numeric;
  v_delivered_total numeric;
  v_status text;
begin
  if p_qty <= 0 then raise exception 'Delivery quantity must be greater than zero'; end if;

  select sku_id, location_id, sales_order_id into v_sku_id, v_location_id, v_so_id
    from public.sales_order_items where id = p_item_id;
  if v_sku_id is null then raise exception 'Sales order item not found'; end if;

  insert into public.stock_movements (
    sku_id, location_id, type, quantity, business_date, sales_order_item_id,
    notes, attachment_path, batch_reference, override_reason, created_by
  ) values (
    v_sku_id, v_location_id, 'sale_delivery', -abs(p_qty), p_business_date, p_item_id,
    p_notes, p_attachment_path, p_batch_reference, p_override_reason, auth.uid()
  ) returning id into v_movement_id;

  select coalesce(sum(soi.ordered_qty), 0) into v_ordered_total
    from public.sales_order_items soi where soi.sales_order_id = v_so_id;

  select coalesce(sum(-sm.quantity), 0) into v_delivered_total
    from public.stock_movements sm
    join public.sales_order_items soi on soi.id = sm.sales_order_item_id
    where soi.sales_order_id = v_so_id and sm.type = 'sale_delivery';

  v_status := case
    when v_delivered_total >= v_ordered_total then 'delivered'
    else 'partially_delivered'
  end;

  update public.sales_orders set status = v_status where id = v_so_id and status <> 'cancelled';

  return v_movement_id;
end $$;

-- --- updated_at maintenance ------------------------------------------------------
drop trigger if exists trg_customers_updated on public.customers;
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- --- Allow Sales Admin to post stock_movements (needed for post_sale_delivery) -
-- The original 0003_rls.sql movements_insert policy predates this module and
-- only listed owner/system_admin/warehouse_admin — sales_admin was never added,
-- which would otherwise block a real Sales Admin from delivering goods even
-- though the app-level RBAC (sales:manage) allows it.
drop policy if exists movements_insert on public.stock_movements;
create policy movements_insert on public.stock_movements for insert to authenticated
  with check (public.auth_role() in ('owner', 'system_admin', 'warehouse_admin', 'sales_admin'));

-- --- RLS --------------------------------------------------------------------------
alter table public.customers          enable row level security;
alter table public.sales_orders       enable row level security;
alter table public.sales_order_items  enable row level security;

-- Prices (unit_price/line_total) and customer contact details live only on
-- rows these same 3 roles can read at all, so scoping SELECT to them is what
-- keeps pricing/customer data out of every other role.
drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists customers_write on public.customers;
create policy customers_write on public.customers for all to authenticated
  using (public.auth_role() in ('owner', 'sales_admin'))
  with check (public.auth_role() in ('owner', 'sales_admin'));

drop policy if exists sales_orders_select on public.sales_orders;
create policy sales_orders_select on public.sales_orders for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists sales_orders_write on public.sales_orders;
create policy sales_orders_write on public.sales_orders for all to authenticated
  using (public.auth_role() in ('owner', 'sales_admin'))
  with check (public.auth_role() in ('owner', 'sales_admin'));

drop policy if exists so_items_select on public.sales_order_items;
create policy so_items_select on public.sales_order_items for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists so_items_write on public.sales_order_items;
create policy so_items_write on public.sales_order_items for all to authenticated
  using (public.auth_role() in ('owner', 'sales_admin'))
  with check (public.auth_role() in ('owner', 'sales_admin'));

grant execute on function public.create_draft_sales_order(uuid, date, date, text, text, text, jsonb) to authenticated;
grant execute on function public.post_sale_delivery(uuid, numeric, date, text, text, text, text) to authenticated;
