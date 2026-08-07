-- =============================================================================
-- Zysteel Operations — 0029 Purchase order manual product lines
--
-- The structured, catalog-linked purchase_order_items (sku_id -> skus) was
-- reactivated and then reverted at the user's request within the same
-- session — see docs/data-dictionary.md, still dormant. What was actually
-- wanted is much lighter: a free-text way to record what's being bought on
-- a Purchase Order, with NO connection to the product/family catalog at
-- all (mirrors quotation_items' shape/spirit, not sales_order_items').
--
-- Deliberately no immutability trigger: unlike the catalog-linked line
-- items (which represented binding, inventory-affecting commitments and
-- therefore locked once Issued, matching the SO precedent), these lines are
-- plain descriptive text — never touch stock_movements, never require a
-- sku_id/location_id — so they stay editable at any PO status, the same
-- posture as the header's own notes/attachment_path fields.
-- =============================================================================

create table if not exists public.purchase_order_manual_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references public.purchase_orders(id) on delete cascade,
  product_name       text not null,
  quantity           numeric(14, 3),
  unit               text,
  unit_price         numeric(14, 4),
  line_total         numeric(16, 4) generated always as (quantity * unit_price) stored,
  created_at         timestamptz not null default now()
);
create index if not exists po_manual_items_po_idx on public.purchase_order_manual_items (purchase_order_id);

-- --- RLS: same shape as purchase_orders/suppliers ------------------------------
alter table public.purchase_order_manual_items enable row level security;

drop policy if exists po_manual_items_select on public.purchase_order_manual_items;
create policy po_manual_items_select on public.purchase_order_manual_items for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'warehouse_admin'));
drop policy if exists po_manual_items_write on public.purchase_order_manual_items;
create policy po_manual_items_write on public.purchase_order_manual_items for all to authenticated
  using (public.auth_role() in ('owner', 'warehouse_admin'))
  with check (public.auth_role() in ('owner', 'warehouse_admin'));
