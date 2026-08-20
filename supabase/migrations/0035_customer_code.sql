-- =============================================================================
-- Zysteel Operations — 0035 Customer ID
--
-- Every customer gets a permanent, human-readable code (CUS-0001, CUS-0002, …)
-- assigned once on insert and never reused — same posture as employee_code
-- (0008_employee_id_sequence.sql) and the ZYS order/receipt numbers
-- (0033_zys_order_receipt_numbering.sql): a customer's code never changes,
-- even after archiving.
--
-- customer_seq is a genuine Postgres SEQUENCE (not a counter table), the same
-- pattern already used for employee_seq / receipt_number_seq — nextval() is
-- atomic by construction and, unlike counter tables, it's not a
-- PostgREST-exposed resource, so it needs no RLS lockdown.
-- =============================================================================

create sequence if not exists public.customer_seq as integer start with 1 increment by 1;

alter table public.customers
  add column if not exists customer_code text;

create or replace function public.assign_customer_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if new.customer_code is null or length(btrim(new.customer_code)) = 0 then
    n := nextval('public.customer_seq');
    new.customer_code := 'CUS-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_customer_code on public.customers;
create trigger trg_assign_customer_code
  before insert on public.customers
  for each row execute function public.assign_customer_code();

-- Backfill any pre-existing rows (no-op on a fresh `db reset`, where the
-- table is empty when migrations run and the seed loads afterwards).
do $$
declare
  r record;
  n int;
begin
  for r in select id from public.customers where customer_code is null order by created_at loop
    n := nextval('public.customer_seq');
    update public.customers set customer_code = 'CUS-' || lpad(n::text, 4, '0') where id = r.id;
  end loop;
end $$;

create unique index if not exists customers_code_uidx on public.customers (customer_code);

-- customer_code is always assigned (by the trigger) going forward.
alter table public.customers alter column customer_code set not null;
