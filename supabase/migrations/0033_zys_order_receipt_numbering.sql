-- =============================================================================
-- Zysteel Operations — 0033 ZYS-format order & receipt numbers
--
-- Redefines assign_so_number() / assign_receipt_number() (both already
-- existing SECURITY DEFINER BEFORE INSERT trigger functions, unchanged in
-- name and attachment — see 0014_sales.sql / 0030_payment_receipts.sql) so
-- they issue new, customer-facing formats from this point forward:
--
--   Sales Order number   ZYS-{YYYY}Y-###   (per-calendar-year, resets to 001)
--   Payment Receipt no.  ZYS-R-######      (global, never resets)
--
-- This is purely a go-forward FORMAT change, not a renumbering. so_number
-- and receipt_number already ARE the permanent Order Number / independent
-- Receipt Number the business wants — they were just shaped SO-YYYY-####
-- and REC-YYYY-#### (the latter resetting yearly, which is the one real
-- behavioural change here). Every number already issued keeps its exact
-- historical value forever: a document's number is assigned once on INSERT
-- and there is no UPDATE path anywhere in the app (0021's own comment on
-- quotation doc numbers: "assigned ONCE ... then never changes" — the same
-- posture already applies to so_number/receipt_number).
--
-- Additive only: sales_order_seq / receipt_seq (the old SO-YYYY-####
-- / REC-YYYY-#### counters) are left completely alone and become dormant —
-- matching this repo's standing posture for superseded counters (see 0030's
-- own header note on deposit_invoice_payments for precedent). Nothing is
-- dropped or repointed.
--
-- New counters reuse the two atomic patterns already proven safe under
-- concurrent inserts elsewhere in this schema, rather than inventing a
-- third:
--   - order_number_seq (year, next_seq): identical shape and `insert ... on
--     conflict do update ... returning` locking as sales_order_seq.
--   - receipt_number_seq: a genuine Postgres SEQUENCE (not a counter table)
--     — the same pattern already used for the permanent, never-reused,
--     non-year-keyed employee_seq (0008). nextval() is atomic by
--     construction and, unlike the counter tables, is not a PostgREST-
--     exposed resource, so (like employee_seq) it needs no RLS lockdown.
--
-- Both new sequences start at 1 (ZYS-2026Y-001 / ZYS-R-000001) rather than
-- continuing the old SO-2026-#### / REC-2026-#### counts — confirmed with
-- the business: the two formats are visually unambiguous, so there is no
-- collision risk either way, and a fresh start is simplest.
-- =============================================================================

-- --- Order number: ZYS-{YYYY}Y-###, atomic, resets per calendar year ----------
create table if not exists public.order_number_seq (
  year      int primary key,
  next_seq  int not null default 1
);

alter table public.order_number_seq enable row level security;

create or replace function public.assign_so_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from coalesce(new.order_date, current_date))::int;
  n int;
begin
  if new.so_number is null or length(btrim(new.so_number)) = 0 then
    insert into public.order_number_seq (year, next_seq) values (y, 1)
      on conflict (year) do update set next_seq = public.order_number_seq.next_seq + 1
      returning next_seq into n;
    new.so_number := 'ZYS-' || y || 'Y-' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;

-- --- Receipt number: ZYS-R-######, atomic, GLOBAL (never resets per year) -----
create sequence if not exists public.receipt_number_seq as integer start with 1 increment by 1;

create or replace function public.assign_receipt_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n bigint;
begin
  if new.receipt_number is null or length(btrim(new.receipt_number)) = 0 then
    n := nextval('public.receipt_number_seq');
    new.receipt_number := 'ZYS-R-' || lpad(n::text, 6, '0');
  end if;
  return new;
end $$;
