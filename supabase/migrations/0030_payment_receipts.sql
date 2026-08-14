-- =============================================================================
-- Zysteel Operations — 0030 Deposit / Final Payment Receipts
--
-- Extends the existing Deposit Invoice feature (0020_deposit_invoices.sql) with
-- a general payment-receipt ledger for a Sales Order: every payment recorded
-- against a SO — deposit or final/balance — gets its own unique, auto-numbered
-- Receipt Number (REC-YYYY-####) and is tagged with which kind of payment it
-- is. This closes a real gap in 0020: deposit_invoices.remaining_balance was
-- only ever a fixed number (total − deposit) that nothing reduced — there was
-- no way to record what happens to it.
--
-- Design notes:
--   - payment_receipts REPLACES deposit_invoice_payments as the write target
--     going forward. deposit_invoice_payments is left in the schema, untouched
--     and now DORMANT — same posture this repo already uses for
--     purchase_order_items etc. (migrations are additive-only; nothing is
--     dropped). Its historical rows are copied into payment_receipts by the
--     one-time backfill below so payment history stays complete.
--   - "Total collected can never exceed the SO total" is enforced once, for
--     BOTH receipt types together, by enforce_payment_receipt_rules() — it
--     sums ALL of a SO's payment_receipts (deposit + final) against the SO's
--     line-item total, freshly computed every time (never a stored balance;
--     same "ledger, not totals" posture as stock_movements/
--     deposit_invoice_payments).
--   - A 'final' receipt additionally requires the SO's deposit invoice to
--     already be 'paid' — final/balance payment only makes sense once the
--     deposit itself is settled.
--   - recompute_deposit_invoice_status_from_receipts() is a NEW function
--     (mirrors recompute_deposit_invoice_status()'s exact arithmetic, sourced
--     from payment_receipts instead), attached to a NEW trigger on
--     payment_receipts. The OLD function/trigger on deposit_invoice_payments
--     is left completely alone rather than repointed — safer than repurposing
--     a live function, and consistent with "add a new dormant-safe path"
--     rather than mutating an old one.
--   - receipt_seq gets RLS enabled with NO policies (default-deny), matching
--     0022_lock_down_sequence_tables.sql's fix for the sibling numbering
--     tables: its only writer is assign_receipt_number(), a SECURITY DEFINER
--     trigger function that bypasses RLS regardless. Skipping this would
--     reintroduce the exact CRITICAL gap 0022 fixed — 0011_grants.sql's
--     blanket default-privilege grant makes every new table anon-writable
--     unless RLS explicitly locks it down.
-- =============================================================================

-- --- payment_receipts (append-only ledger) --------------------------------------
create table if not exists public.payment_receipts (
  id                  uuid primary key default gen_random_uuid(),
  receipt_number      text unique,
  sales_order_id      uuid not null references public.sales_orders(id) on delete restrict,
  deposit_invoice_id  uuid not null references public.deposit_invoices(id) on delete restrict,
  receipt_type        text not null check (receipt_type in ('deposit', 'final')),
  amount              numeric(16, 4) not null check (amount > 0),
  paid_date           date not null default current_date,
  method              text,
  notes               text,
  recorded_by         uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists payment_receipts_so_idx on public.payment_receipts (sales_order_id);
create index if not exists payment_receipts_invoice_idx on public.payment_receipts (deposit_invoice_id);

-- --- Receipt number: REC-YYYY-####, atomic, resets per calendar year -----------
create table if not exists public.receipt_seq (
  year      int primary key,
  next_seq  int not null default 1
);

create or replace function public.assign_receipt_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from current_date)::int;
  n int;
begin
  if new.receipt_number is null or length(btrim(new.receipt_number)) = 0 then
    insert into public.receipt_seq (year, next_seq) values (y, 1)
      on conflict (year) do update set next_seq = public.receipt_seq.next_seq + 1
      returning next_seq into n;
    new.receipt_number := 'REC-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_receipt_number on public.payment_receipts;
create trigger trg_assign_receipt_number
  before insert on public.payment_receipts
  for each row execute function public.assign_receipt_number();

-- --- Deposit invoice status now also derivable from payment_receipts -----------
-- New function/trigger (deposit-type rows only) — the OLD
-- recompute_deposit_invoice_status()/its trigger on deposit_invoice_payments
-- are untouched and now dormant, since the app stops writing to that table.
create or replace function public.recompute_deposit_invoice_status_from_receipts()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_deposit_amount numeric;
  v_paid_total numeric;
  v_status text;
begin
  if new.receipt_type <> 'deposit' then
    return new;
  end if;

  select deposit_amount into v_deposit_amount
    from public.deposit_invoices where id = new.deposit_invoice_id;

  select coalesce(sum(amount), 0) into v_paid_total
    from public.payment_receipts
    where deposit_invoice_id = new.deposit_invoice_id and receipt_type = 'deposit';

  v_status := case
    when v_paid_total <= 0 then 'pending_deposit'
    when v_paid_total < v_deposit_amount then 'partially_paid'
    else 'paid'
  end;

  update public.deposit_invoices set status = v_status, updated_at = now()
    where id = new.deposit_invoice_id and status <> 'void';

  return new;
end $$;

drop trigger if exists trg_recompute_deposit_invoice_status_from_receipts on public.payment_receipts;
create trigger trg_recompute_deposit_invoice_status_from_receipts
  after insert on public.payment_receipts
  for each row execute function public.recompute_deposit_invoice_status_from_receipts();

-- --- One-time backfill: deposit_invoice_payments -> payment_receipts -----------
-- Preserves full payment history (each historical payment gets a real REC
-- number, ordered chronologically) before the guard trigger below is attached
-- — so historical data is never re-validated against today's rules.
insert into public.payment_receipts (
  sales_order_id, deposit_invoice_id, receipt_type, amount, paid_date, method, notes,
  recorded_by, created_at
)
select di.sales_order_id, dip.deposit_invoice_id, 'deposit', dip.amount, dip.paid_date,
       dip.method, dip.notes, dip.recorded_by, dip.created_at
from public.deposit_invoice_payments dip
join public.deposit_invoices di on di.id = dip.deposit_invoice_id
order by dip.created_at asc;

-- --- Guard: total collected (deposit + final) may never exceed the SO total ----
-- --- and a 'final' receipt requires the deposit invoice to already be 'paid' ---
-- Attached LAST (after the backfill above) so it only ever governs new inserts.
create or replace function public.enforce_payment_receipt_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_so_total       numeric;
  v_already_paid   numeric;
  v_invoice_status text;
  v_invoice_so_id  uuid;
begin
  select coalesce(sum(line_total), 0) into v_so_total
    from public.sales_order_items where sales_order_id = new.sales_order_id;

  select coalesce(sum(amount), 0) into v_already_paid
    from public.payment_receipts where sales_order_id = new.sales_order_id;

  if v_already_paid + new.amount > v_so_total + 0.01 then
    raise exception
      'PAYMENT_EXCEEDS_SO_TOTAL: recording % would bring total payments to % which exceeds the sales order total %',
      new.amount, v_already_paid + new.amount, v_so_total;
  end if;

  select status, sales_order_id into v_invoice_status, v_invoice_so_id
    from public.deposit_invoices where id = new.deposit_invoice_id;

  if v_invoice_so_id is null then
    raise exception 'DEPOSIT_INVOICE_NOT_FOUND: deposit invoice % not found', new.deposit_invoice_id;
  end if;
  if v_invoice_so_id is distinct from new.sales_order_id then
    raise exception 'RECEIPT_INVOICE_MISMATCH: the deposit invoice does not belong to this sales order';
  end if;

  if new.receipt_type = 'deposit' then
    if v_invoice_status = 'void' then
      raise exception 'DEPOSIT_RECEIPT_INVOICE_VOID: cannot record a payment against a void deposit invoice';
    end if;
  elsif new.receipt_type = 'final' then
    if v_invoice_status is distinct from 'paid' then
      raise exception
        'FINAL_PAYMENT_REQUIRES_PAID_DEPOSIT: the deposit must be fully paid before a final payment can be recorded';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_payment_receipt_rules on public.payment_receipts;
create trigger trg_enforce_payment_receipt_rules
  before insert on public.payment_receipts
  for each row execute function public.enforce_payment_receipt_rules();

-- --- RLS -------------------------------------------------------------------------
-- Same shape as deposit_invoice_payments (0020): Owner / System Admin / Sales
-- Admin may read; Owner / Sales Admin may write.
alter table public.payment_receipts enable row level security;

drop policy if exists payment_receipts_select on public.payment_receipts;
create policy payment_receipts_select on public.payment_receipts for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists payment_receipts_write on public.payment_receipts;
create policy payment_receipts_write on public.payment_receipts for all to authenticated
  using (public.auth_role() in ('owner', 'sales_admin'))
  with check (public.auth_role() in ('owner', 'sales_admin'));

-- receipt_seq: RLS enabled, NO policies — only assign_receipt_number() (SECURITY
-- DEFINER) ever writes it, exactly like deposit_invoice_seq/sales_order_seq/etc.
alter table public.receipt_seq enable row level security;
