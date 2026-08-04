-- =============================================================================
-- Zysteel Operations — 0022 Lock down document-numbering sequence tables
--
-- sales_order_seq / purchase_order_seq / sales_inquiry_seq / deposit_invoice_seq
-- / quotation_doc_seq store only a (year|period, next_seq) counter — no
-- business data — but had RLS disabled while still holding full CRUD grants
-- to anon/authenticated (either explicit, or inherited from 0011_grants.sql's
-- `alter default privileges ... grant all on tables`). Since the Supabase
-- anon key is public by design, this meant ANY unauthenticated request could
-- read/insert/update/delete these counters directly via the REST API —
-- e.g. reset next_seq and cause future document numbers to collide with
-- already-issued ones, or corrupt the sequence outright. Flagged by
-- Supabase's own Security Advisor ("RLS Disabled in Public — CRITICAL").
--
-- Fix: enable RLS with NO policies for four of the five. Their only writers
-- are SECURITY DEFINER trigger functions (assign_so_number, assign_po_number,
-- assign_inquiry_no, assign_deposit_invoice_number) — these run as the
-- function owner and so bypass RLS regardless, exactly like every other
-- SECURITY DEFINER trigger already in this schema (e.g.
-- enforce_so_item_immutable on sales_order_items, which already has RLS
-- enabled). No application code ever reads or writes these tables directly,
-- so a default-deny (no policies) is correct and safe for those four.
--
-- quotation_doc_seq is the exception: issue_quotation_document() (0021) is
-- SECURITY INVOKER, not SECURITY DEFINER, so it runs as the calling
-- authenticated user and DOES need an explicit policy — otherwise real
-- Quotation/Deposit/Balance document issuance breaks for legitimate users,
-- not just anonymous ones. Mirrors the exact role set already used for
-- quotations/quotation_items in 0021_quotations.sql.
-- =============================================================================

alter table public.sales_order_seq       enable row level security;
alter table public.purchase_order_seq    enable row level security;
alter table public.sales_inquiry_seq     enable row level security;
alter table public.deposit_invoice_seq   enable row level security;
alter table public.quotation_doc_seq     enable row level security;

drop policy if exists quotation_doc_seq_all on public.quotation_doc_seq;
create policy quotation_doc_seq_all on public.quotation_doc_seq for all to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'sales_admin'))
  with check (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
