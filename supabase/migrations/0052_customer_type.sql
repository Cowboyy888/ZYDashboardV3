-- =============================================================================
-- Zysteel Operations — 0052 Customer type on customers
-- Reuses the same editable list Inquiries already uses (inquiry_customer_types
-- — 中间商/Distributor, 工地/Construction, 零售/Retail, 政府/Government — see
-- 0018_customer_inquiries.sql) rather than a second parallel list, so a
-- customer's type stays the same vocabulary as the inquiry they came from.
-- =============================================================================

alter table public.customers
  add column if not exists customer_type_id uuid references public.inquiry_customer_types(id) on delete set null;

create index if not exists customers_customer_type_idx on public.customers (customer_type_id);
