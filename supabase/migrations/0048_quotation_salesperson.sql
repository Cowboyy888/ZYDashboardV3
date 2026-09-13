-- =============================================================================
-- Zysteel Operations — 0048 Salesperson on quotations
-- Same shape as sales_inquiries.salesperson_id (0018_customer_inquiries.sql):
-- who made the sale, so quotations can be attributed/filtered per salesperson
-- the same way inquiries already are.
-- =============================================================================

alter table public.quotations
  add column if not exists salesperson_id uuid references public.employees(id) on delete set null;

create index if not exists quotations_salesperson_idx on public.quotations (salesperson_id);
