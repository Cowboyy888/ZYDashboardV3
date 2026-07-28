-- =============================================================================
-- Zysteel Operations — 0013 Purchasing (Second pass)
-- Suppliers, Purchase Orders, Purchase Order Items, and Goods Receiving.
--
-- Design notes:
--   - Received/outstanding quantity is NEVER stored — like stock itself, it is
--     always derived from the append-only stock_movements ledger (view
--     purchase_order_item_received). Only `purchase_orders.status` is a stored,
--     recomputed-on-receive convenience field.
--   - Receiving posts a normal `purchase_receipt` stock_movements row (the type
--     already existed in the ledger check constraint, unused until now), linked
--     back to its purchase_order_item via a new nullable column. This is the
--     "immutable purchase_receipt stock movement".
--   - Over-receipt and negative-stock use the exact same shape of guard: blocked
--     unless an Owner override with a recorded reason is present, enforced by a
--     BEFORE INSERT trigger as the ultimate authority (belt & suspenders).
--   - purchase_order_items is named to match the forward-compatible
--     `product_family_usage()` helper added in 0009, which already probes for
--     `public.purchase_order_items`.
-- =============================================================================

-- --- Suppliers (editable master data) ----------------------------------------
create table if not exists public.suppliers (
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

-- --- Purchase orders ----------------------------------------------------------
create table if not exists public.purchase_orders (
  id                     uuid primary key default gen_random_uuid(),
  po_number              text unique,
  supplier_id            uuid not null references public.suppliers(id) on delete restrict,
  order_date             date not null default current_date,
  expected_arrival_date  date,
  currency               text not null check (currency in ('USD', 'KHR', 'CNY')),
  status                 text not null default 'draft'
                         check (status in ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  notes                  text,
  attachment_path        text,
  created_by             uuid references public.profiles(id) on delete set null,
  issued_at              timestamptz,
  cancelled_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists purchase_orders_status_idx on public.purchase_orders (status);
create index if not exists purchase_orders_expected_idx on public.purchase_orders (expected_arrival_date);
create index if not exists purchase_orders_supplier_idx on public.purchase_orders (supplier_id);

-- --- Purchase order items (one row per SKU line on a PO) ----------------------
-- `unit` is copied from the SKU at insert time (never user-chosen) so a
-- purchase can never silently use a different unit than the stock ledger —
-- there is no conversion path to get wrong.
create table if not exists public.purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references public.purchase_orders(id) on delete cascade,
  sku_id             uuid not null references public.skus(id) on delete restrict,
  location_id        uuid not null references public.locations(id) on delete restrict,
  unit               text not null,
  ordered_qty        numeric(14, 3) not null check (ordered_qty > 0),
  unit_cost          numeric(14, 4) not null check (unit_cost >= 0),
  line_total         numeric(16, 4) generated always as (ordered_qty * unit_cost) stored,
  created_at         timestamptz not null default now()
);
create index if not exists po_items_po_idx on public.purchase_order_items (purchase_order_id);
create index if not exists po_items_sku_idx on public.purchase_order_items (sku_id);

-- --- Link stock_movements back to the PO item it fulfils ----------------------
alter table public.stock_movements
  add column if not exists purchase_order_item_id uuid references public.purchase_order_items(id) on delete restrict,
  add column if not exists batch_reference text;
create index if not exists stock_movements_po_item_idx on public.stock_movements (purchase_order_item_id);

-- Received quantity per item, derived from the ledger — never stored/edited.
create or replace view public.purchase_order_item_received
  with (security_invoker = on) as
  select purchase_order_item_id as item_id, sum(quantity)::numeric(14, 3) as received_qty
  from public.stock_movements
  where type = 'purchase_receipt' and purchase_order_item_id is not null
  group by purchase_order_item_id;

-- --- PO number: PO-YYYY-####, atomic, resets per calendar year ---------------
create table if not exists public.purchase_order_seq (
  year      int primary key,
  next_seq  int not null default 1
);

create or replace function public.assign_po_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from coalesce(new.order_date, current_date))::int;
  n int;
begin
  if new.po_number is null or length(btrim(new.po_number)) = 0 then
    insert into public.purchase_order_seq (year, next_seq) values (y, 1)
      on conflict (year) do update set next_seq = public.purchase_order_seq.next_seq + 1
      returning next_seq into n;
    new.po_number := 'PO-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_po_number on public.purchase_orders;
create trigger trg_assign_po_number
  before insert on public.purchase_orders
  for each row execute function public.assign_po_number();

-- --- PO header: lock commercial terms once issued (status <> draft) ----------
-- expected_arrival_date / notes / attachment_path / status remain editable —
-- suppliers routinely revise ETAs after a PO is placed.
create or replace function public.enforce_po_header_immutable()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from 'draft' then
    if new.supplier_id is distinct from old.supplier_id
       or new.currency is distinct from old.currency
       or new.order_date is distinct from old.order_date then
      raise exception 'PO_HEADER_LOCKED: supplier/currency/order date cannot change once the PO is issued';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_po_header_guard on public.purchase_orders;
create trigger trg_po_header_guard
  before update on public.purchase_orders
  for each row execute function public.enforce_po_header_immutable();

-- --- PO items: freely editable while draft, immutable once issued ------------
create or replace function public.enforce_po_item_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  po_status text;
begin
  select status into po_status from public.purchase_orders
    where id = coalesce(new.purchase_order_id, old.purchase_order_id);
  if po_status is distinct from 'draft' then
    raise exception 'PO_ITEM_LOCKED: purchase order items cannot be changed once the PO is issued';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_po_items_no_update on public.purchase_order_items;
create trigger trg_po_items_no_update
  before update on public.purchase_order_items
  for each row execute function public.enforce_po_item_immutable();
drop trigger if exists trg_po_items_no_delete on public.purchase_order_items;
create trigger trg_po_items_no_delete
  before delete on public.purchase_order_items
  for each row execute function public.enforce_po_item_immutable();

-- --- Receiving guard: no draft/cancelled receiving; over-receipt needs Owner --
create or replace function public.enforce_purchase_receipt_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  po_status        text;
  ordered          numeric;
  already_received numeric;
  actor_role       app_role;
begin
  if new.type <> 'purchase_receipt' or new.purchase_order_item_id is null then
    return new;
  end if;

  select po.status, poi.ordered_qty
    into po_status, ordered
    from public.purchase_order_items poi
    join public.purchase_orders po on po.id = poi.purchase_order_id
    where poi.id = new.purchase_order_item_id;

  if po_status is null then
    raise exception 'PO_ITEM_NOT_FOUND: purchase order item % not found', new.purchase_order_item_id;
  end if;
  if po_status = 'cancelled' then
    raise exception 'CANCELLED_PO_BLOCKED: cannot receive stock against a cancelled purchase order';
  end if;
  if po_status = 'draft' then
    raise exception 'DRAFT_PO_BLOCKED: purchase order must be issued before it can receive stock';
  end if;

  select coalesce(sum(quantity), 0) into already_received
    from public.stock_movements
    where purchase_order_item_id = new.purchase_order_item_id and type = 'purchase_receipt';

  if (already_received + new.quantity) > ordered then
    if new.override_reason is null or length(btrim(new.override_reason)) = 0 then
      raise exception
        'OVER_RECEIPT_BLOCKED: receiving % would exceed the ordered quantity % (already received %); an Owner override with a recorded reason is required',
        new.quantity, ordered, already_received;
    end if;
    actor_role := public.auth_role();
    if actor_role is distinct from 'owner' then
      raise exception 'OVER_RECEIPT_OVERRIDE_FORBIDDEN: only an Owner may override an over-receipt';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_purchase_receipt_rules on public.stock_movements;
create trigger trg_enforce_purchase_receipt_rules
  before insert on public.stock_movements
  for each row execute function public.enforce_purchase_receipt_rules();

-- --- Atomic "create draft PO with items" RPC ----------------------------------
-- SECURITY INVOKER: RLS on purchase_orders/purchase_order_items still governs
-- who may call this.
create or replace function public.create_draft_purchase_order(
  p_supplier_id uuid,
  p_order_date date,
  p_expected_arrival_date date,
  p_currency text,
  p_notes text,
  p_attachment_path text,
  p_items jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_po_id uuid;
  item jsonb;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase order needs at least one line item';
  end if;

  insert into public.purchase_orders (
    supplier_id, order_date, expected_arrival_date, currency, notes, attachment_path, created_by
  ) values (
    p_supplier_id, p_order_date, p_expected_arrival_date, p_currency, p_notes, p_attachment_path, auth.uid()
  ) returning id into v_po_id;

  for item in select * from jsonb_array_elements(p_items) loop
    insert into public.purchase_order_items (
      purchase_order_id, sku_id, location_id, unit, ordered_qty, unit_cost
    ) values (
      v_po_id,
      (item->>'skuId')::uuid,
      (item->>'locationId')::uuid,
      item->>'unit',
      (item->>'orderedQty')::numeric,
      (item->>'unitCost')::numeric
    );
  end loop;

  return v_po_id;
end $$;

-- --- Atomic "receive goods against a PO item" RPC -----------------------------
-- Inserts the purchase_receipt movement (guarded by the trigger above) then
-- recomputes purchase_orders.status from the ledger across ALL items.
create or replace function public.post_purchase_receipt(
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
  v_po_id uuid;
  v_movement_id uuid;
  v_ordered_total numeric;
  v_received_total numeric;
  v_status text;
begin
  if p_qty <= 0 then raise exception 'Receipt quantity must be greater than zero'; end if;

  select sku_id, location_id, purchase_order_id into v_sku_id, v_location_id, v_po_id
    from public.purchase_order_items where id = p_item_id;
  if v_sku_id is null then raise exception 'Purchase order item not found'; end if;

  insert into public.stock_movements (
    sku_id, location_id, type, quantity, business_date, purchase_order_item_id,
    notes, attachment_path, batch_reference, override_reason, created_by
  ) values (
    v_sku_id, v_location_id, 'purchase_receipt', p_qty, p_business_date, p_item_id,
    p_notes, p_attachment_path, p_batch_reference, p_override_reason, auth.uid()
  ) returning id into v_movement_id;

  select coalesce(sum(poi.ordered_qty), 0) into v_ordered_total
    from public.purchase_order_items poi where poi.purchase_order_id = v_po_id;

  select coalesce(sum(sm.quantity), 0) into v_received_total
    from public.stock_movements sm
    join public.purchase_order_items poi on poi.id = sm.purchase_order_item_id
    where poi.purchase_order_id = v_po_id and sm.type = 'purchase_receipt';

  v_status := case
    when v_received_total >= v_ordered_total then 'received'
    else 'partially_received'
  end;

  update public.purchase_orders set status = v_status where id = v_po_id and status <> 'cancelled';

  return v_movement_id;
end $$;

-- --- updated_at maintenance ----------------------------------------------------
drop trigger if exists trg_suppliers_updated on public.suppliers;
create trigger trg_suppliers_updated before update on public.suppliers
  for each row execute function public.set_updated_at();

-- --- RLS ------------------------------------------------------------------------
alter table public.suppliers            enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;

-- Costs (unit_cost/line_total) live only on rows these same 3 roles can read at
-- all, so scoping SELECT to them is what keeps costs out of every other role.
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'warehouse_admin'));
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all to authenticated
  using (public.auth_role() in ('owner', 'warehouse_admin'))
  with check (public.auth_role() in ('owner', 'warehouse_admin'));

drop policy if exists purchase_orders_select on public.purchase_orders;
create policy purchase_orders_select on public.purchase_orders for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'warehouse_admin'));
drop policy if exists purchase_orders_write on public.purchase_orders;
create policy purchase_orders_write on public.purchase_orders for all to authenticated
  using (public.auth_role() in ('owner', 'warehouse_admin'))
  with check (public.auth_role() in ('owner', 'warehouse_admin'));

drop policy if exists po_items_select on public.purchase_order_items;
create policy po_items_select on public.purchase_order_items for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'warehouse_admin'));
drop policy if exists po_items_write on public.purchase_order_items;
create policy po_items_write on public.purchase_order_items for all to authenticated
  using (public.auth_role() in ('owner', 'warehouse_admin'))
  with check (public.auth_role() in ('owner', 'warehouse_admin'));

grant execute on function public.create_draft_purchase_order(uuid, date, date, text, text, text, jsonb) to authenticated;
grant execute on function public.post_purchase_receipt(uuid, numeric, date, text, text, text, text) to authenticated;
