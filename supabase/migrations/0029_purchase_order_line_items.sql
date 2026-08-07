-- =============================================================================
-- Zysteel Operations — 0029 Reactivate Purchase Order line items
--
-- Purchase Orders regain line items (SKU + location + qty + unit cost), built
-- once in 0013_purchasing.sql, then deliberately simplified to header-only at
-- the user's request. Receiving/goods-receipt is OUT OF SCOPE and stays fully
-- dormant — this migration does NOT touch enforce_purchase_receipt_rules,
-- the purchase_order_item_received view, post_purchase_receipt, or
-- stock_movements.purchase_order_item_id.
--
-- Mirrors 0027_quotation_to_sales_order.sql's shape for sales_order_items:
--   - purchase_order_items already has RLS + an UPDATE/DELETE-only guard —
--     INSERT was never guarded because items only ever arrived via the
--     atomic creation RPC. addPurchaseOrderItem can now insert one at a time
--     against an EXISTING order, so INSERT needs the same "only while draft"
--     guard.
--   - create_draft_purchase_order is replaced with a corrected signature:
--     p_expected_arrival_date is dropped (that ETA/overdue feature was
--     removed from the app separately; the column stays on the table,
--     unused, per the additive-only migrations rule — see
--     src/lib/db/types.ts's PurchaseOrderRow comment).
--   - enforce_po_header_immutable additionally blocks draft -> ordered with
--     zero line items (mirrors enforce_so_header_immutable's
--     SO_CONFIRM_NO_ITEMS guard), covering the case where every item is
--     removed from a Draft PO via removePurchaseOrderItem before Issue.
-- =============================================================================

-- --- create_draft_purchase_order: drop expected_arrival_date, keep >=1 item requirement --
-- Signature is changing (6 args instead of 7) — drop the old one explicitly,
-- same reasoning as 0027's drop for create_draft_sales_order.
drop function if exists public.create_draft_purchase_order(uuid, date, date, text, text, text, jsonb);

create or replace function public.create_draft_purchase_order(
  p_supplier_id uuid,
  p_order_date date,
  p_currency text,
  p_notes text,
  p_attachment_path text,
  p_items jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_po_id uuid;
  item jsonb;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A purchase order needs at least one line item';
  end if;

  insert into public.purchase_orders (
    supplier_id, order_date, currency, notes, attachment_path, created_by
  ) values (
    p_supplier_id, p_order_date, p_currency, p_notes, p_attachment_path, auth.uid()
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

grant execute on function public.create_draft_purchase_order(
  uuid, date, text, text, text, jsonb
) to authenticated;

-- --- PO items: also guard INSERT (previously only UPDATE/DELETE were guarded) --
drop trigger if exists trg_po_items_no_insert on public.purchase_order_items;
create trigger trg_po_items_no_insert
  before insert on public.purchase_order_items
  for each row execute function public.enforce_po_item_immutable();

-- --- PO header: block draft -> ordered with zero line items --------------------
create or replace function public.enforce_po_header_immutable()
returns trigger language plpgsql as $$
declare
  v_item_count int;
begin
  if old.status is distinct from 'draft' then
    if new.supplier_id is distinct from old.supplier_id
       or new.currency is distinct from old.currency
       or new.order_date is distinct from old.order_date then
      raise exception 'PO_HEADER_LOCKED: supplier/currency/order date cannot change once the PO is issued';
    end if;
  end if;
  if old.status = 'draft' and new.status = 'ordered' then
    select count(*) into v_item_count from public.purchase_order_items where purchase_order_id = old.id;
    if v_item_count = 0 then
      raise exception 'PO_ISSUE_NO_ITEMS: a purchase order needs at least one line item before it can be issued';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
-- No `drop trigger`/`create trigger` needed here — trg_po_header_guard
-- (0013) already points at this function name; replacing the body is enough
-- (same technique 0027 used for enforce_so_header_immutable).
