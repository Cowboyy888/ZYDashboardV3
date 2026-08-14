-- =============================================================================
-- Zysteel Operations — 0031 stock_movements delivery index
-- sales_order_item_delivered (0014_sales.sql) aggregates over stock_movements
-- filtered by type = 'sale_delivery', and is called unfiltered (no itemIds)
-- from the Sales dashboard, Sales Orders list, and sales export — the
-- highest-traffic reads in the app — yet nothing indexes `type`, so every one
-- of those loads sequentially scans the whole (append-only, ever-growing)
-- ledger. This partial index matches the view's WHERE + GROUP BY exactly.
-- =============================================================================

create index if not exists stock_movements_sale_delivery_idx
  on public.stock_movements (sales_order_item_id)
  where type = 'sale_delivery' and sales_order_item_id is not null;
