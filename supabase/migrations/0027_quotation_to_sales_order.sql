-- =============================================================================
-- Zysteel Operations — 0027 Connect a paid Quotation deposit to a Sales Order
--
-- When a Quotation's deposit is marked paid, the app now auto-creates a Draft
-- Sales Order for it (customer/currency/notes only — see
-- src/lib/actions/quotations.ts's markPaid). It cannot also populate real line
-- items: quotation_items are free-text (description/wire_dia/steel_grade)
-- typed by a sales rep, while sales_order_items require a real sku_id +
-- location_id resolved against the product catalog — there is no reliable
-- automatic mapping between the two. The Draft Sales Order is created with
-- ZERO items; a human picks the matching SKU/warehouse per line afterward
-- (new "Add item" action below), using the quotation's items as a reference.
--
-- This means "a sales order needs at least one line item" can no longer be
-- enforced at CREATION time — it moves to CONFIRM time instead, which is
-- actually the more correct place for it: Draft has always been the
-- deliberately-incomplete, freely-editable state everywhere else in this
-- schema (SO items/payroll items/PO items are all only immutable once their
-- parent leaves draft), so a momentarily-empty Draft is consistent with that,
-- not a special case.
-- =============================================================================

-- --- Link a Sales Order back to the Quotation that spawned it ------------------
alter table public.sales_orders
  add column if not exists quotation_id uuid references public.quotations(id) on delete set null;
create index if not exists sales_orders_quotation_idx on public.sales_orders (quotation_id);

-- --- create_draft_sales_order: allow zero items; accept an optional quotation link
-- Adding a new trailing parameter (even with a default) creates a SEPARATE
-- overload rather than replacing the existing 7-arg function, which makes
-- the two signatures ambiguous for any 7-arg call (ERROR 42725, "is not
-- unique") — drop the old signature explicitly first.
drop function if exists public.create_draft_sales_order(uuid, date, date, text, text, text, jsonb);

create or replace function public.create_draft_sales_order(
  p_customer_id uuid,
  p_order_date date,
  p_expected_delivery_date date,
  p_currency text,
  p_notes text,
  p_attachment_path text,
  p_items jsonb,
  p_quotation_id uuid default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_so_id uuid;
  item jsonb;
  v_area numeric;
  v_price_sqm numeric;
  v_unit_price numeric;
begin
  insert into public.sales_orders (
    customer_id, order_date, expected_delivery_date, currency, notes, attachment_path,
    quotation_id, created_by
  ) values (
    p_customer_id, p_order_date, p_expected_delivery_date, p_currency, p_notes, p_attachment_path,
    p_quotation_id, auth.uid()
  ) returning id into v_so_id;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_area := nullif(item->>'areaPerSheet', '')::numeric;
    v_price_sqm := nullif(item->>'pricePerSqm', '')::numeric;
    if v_area is not null and v_price_sqm is not null then
      v_unit_price := v_price_sqm * v_area;
    else
      v_unit_price := (item->>'unitPrice')::numeric;
    end if;

    insert into public.sales_order_items (
      sales_order_id, sku_id, location_id, unit, ordered_qty, unit_price, area_per_sheet, price_per_sqm
    ) values (
      v_so_id,
      (item->>'skuId')::uuid,
      (item->>'locationId')::uuid,
      item->>'unit',
      (item->>'orderedQty')::numeric,
      v_unit_price,
      v_area,
      v_price_sqm
    );
  end loop;

  return v_so_id;
end $$;

grant execute on function public.create_draft_sales_order(
  uuid, date, date, text, text, text, jsonb, uuid
) to authenticated;

-- --- SO items: also guard INSERT (previously only UPDATE/DELETE were guarded, ---
-- --- because items only ever arrived via the atomic creation RPC above; now ----
-- --- addSalesOrderItem can insert one at a time against an EXISTING order, so --
-- --- the same "only while draft" rule needs to cover INSERT too) ---------------
drop trigger if exists trg_so_items_no_insert on public.sales_order_items;
create trigger trg_so_items_no_insert
  before insert on public.sales_order_items
  for each row execute function public.enforce_so_item_immutable();

-- --- SO header: block draft -> confirmed with zero line items ------------------
create or replace function public.enforce_so_header_immutable()
returns trigger language plpgsql as $$
declare
  v_item_count int;
begin
  if old.status is distinct from 'draft' then
    if new.customer_id is distinct from old.customer_id
       or new.currency is distinct from old.currency
       or new.order_date is distinct from old.order_date then
      raise exception 'SO_HEADER_LOCKED: customer/currency/order date cannot change once the sales order is confirmed';
    end if;
  end if;
  if old.status = 'draft' and new.status = 'confirmed' then
    select count(*) into v_item_count from public.sales_order_items where sales_order_id = old.id;
    if v_item_count = 0 then
      raise exception 'SO_CONFIRM_NO_ITEMS: a sales order needs at least one line item before it can be confirmed';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
