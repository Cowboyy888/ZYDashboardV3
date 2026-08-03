-- =============================================================================
-- Zysteel Operations — 0020 Deposit Invoices
-- Adds an optional per-m² pricing breakdown to Sales Order line items, and a
-- Deposit Invoice document generated off a confirmed Sales Order.
--
-- Design notes:
--   - sales_order_items.area_per_sheet / price_per_sqm are NULLABLE additions.
--     unit_price stays the money source of truth: when both new fields are
--     supplied, create_draft_sales_order derives unit_price from them
--     server-side (never trusts a client-computed unit_price alongside them);
--     when absent, the legacy flat-unit_price path is unchanged.
--   - deposit_invoices.deposit_amount / remaining_balance are GENERATED
--     columns off total_order_amount + deposit_percentage — same "derive,
--     never store the arithmetic" posture as sales_order_items.line_total and
--     overtime_entries' amount columns.
--   - deposit_invoice_payments is an append-only ledger (mirrors
--     stock_movements): amount_paid is always SUM(amount), never a stored
--     balance. A trigger recomputes deposit_invoices.status after each
--     payment insert, and a second trigger mirrors that status onto
--     sales_orders.payment_status — a read-optimised denormalisation, not a
--     second source of truth. The app never writes payment_status directly.
--   - One active (non-void) deposit invoice per sales order, enforced by a
--     partial unique index — not just a UI-level check.
-- =============================================================================

-- --- Sales order items: optional per-m² pricing breakdown -----------------------
alter table public.sales_order_items
  add column if not exists area_per_sheet numeric(14, 3),
  add column if not exists price_per_sqm numeric(14, 4);

-- --- Sales orders: payment status (orthogonal to the delivery-tracking status) --
alter table public.sales_orders
  add column if not exists payment_status text not null default 'none'
    check (payment_status in ('none', 'pending_deposit', 'partially_paid', 'paid'));

-- --- create_draft_sales_order: derive unit_price from area/price-per-m² when --
-- --- supplied; unchanged flat-unit_price behaviour otherwise -------------------
create or replace function public.create_draft_sales_order(
  p_customer_id uuid,
  p_order_date date,
  p_expected_delivery_date date,
  p_currency text,
  p_notes text,
  p_attachment_path text,
  p_items jsonb
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_so_id uuid;
  item jsonb;
  v_area numeric;
  v_price_sqm numeric;
  v_unit_price numeric;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'A sales order needs at least one line item';
  end if;

  insert into public.sales_orders (
    customer_id, order_date, expected_delivery_date, currency, notes, attachment_path, created_by
  ) values (
    p_customer_id, p_order_date, p_expected_delivery_date, p_currency, p_notes, p_attachment_path, auth.uid()
  ) returning id into v_so_id;

  for item in select * from jsonb_array_elements(p_items) loop
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

-- --- Deposit invoices ------------------------------------------------------------
create table if not exists public.deposit_invoices (
  id                    uuid primary key default gen_random_uuid(),
  invoice_number        text unique,
  sales_order_id        uuid not null references public.sales_orders(id) on delete restrict,
  deposit_percentage    numeric(5, 2) not null check (deposit_percentage > 0 and deposit_percentage <= 100),
  total_order_amount    numeric(16, 4) not null check (total_order_amount >= 0),
  deposit_amount        numeric(16, 4) generated always as (
                           round(total_order_amount * deposit_percentage / 100, 4)
                         ) stored,
  remaining_balance     numeric(16, 4) generated always as (
                           total_order_amount - round(total_order_amount * deposit_percentage / 100, 4)
                         ) stored,
  currency              text not null check (currency in ('USD', 'KHR', 'CNY')),
  status                text not null default 'pending_deposit'
                        check (status in ('pending_deposit', 'partially_paid', 'paid', 'void')),
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists deposit_invoices_so_idx on public.deposit_invoices (sales_order_id);
-- One active (non-void) deposit invoice per sales order.
create unique index if not exists deposit_invoices_active_so_idx
  on public.deposit_invoices (sales_order_id) where status <> 'void';

-- --- Deposit invoice payments (append-only ledger — never updated/deleted) ------
create table if not exists public.deposit_invoice_payments (
  id                  uuid primary key default gen_random_uuid(),
  deposit_invoice_id  uuid not null references public.deposit_invoices(id) on delete restrict,
  amount              numeric(16, 4) not null check (amount > 0),
  paid_date           date not null default current_date,
  method              text,
  notes               text,
  recorded_by         uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists deposit_invoice_payments_invoice_idx
  on public.deposit_invoice_payments (deposit_invoice_id);

-- --- Invoice number: DI-YYYY-####, atomic, resets per calendar year -------------
create table if not exists public.deposit_invoice_seq (
  year      int primary key,
  next_seq  int not null default 1
);

create or replace function public.assign_deposit_invoice_number()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from current_date)::int;
  n int;
begin
  if new.invoice_number is null or length(btrim(new.invoice_number)) = 0 then
    insert into public.deposit_invoice_seq (year, next_seq) values (y, 1)
      on conflict (year) do update set next_seq = public.deposit_invoice_seq.next_seq + 1
      returning next_seq into n;
    new.invoice_number := 'DI-' || y || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_deposit_invoice_number on public.deposit_invoices;
create trigger trg_assign_deposit_invoice_number
  before insert on public.deposit_invoices
  for each row execute function public.assign_deposit_invoice_number();

-- --- Status derives from the payments ledger — never set directly by the app ----
create or replace function public.recompute_deposit_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_deposit_amount numeric;
  v_paid_total numeric;
  v_status text;
begin
  select deposit_amount into v_deposit_amount
    from public.deposit_invoices where id = new.deposit_invoice_id;

  select coalesce(sum(amount), 0) into v_paid_total
    from public.deposit_invoice_payments where deposit_invoice_id = new.deposit_invoice_id;

  v_status := case
    when v_paid_total <= 0 then 'pending_deposit'
    when v_paid_total < v_deposit_amount then 'partially_paid'
    else 'paid'
  end;

  update public.deposit_invoices set status = v_status, updated_at = now()
    where id = new.deposit_invoice_id and status <> 'void';

  return new;
end $$;

drop trigger if exists trg_recompute_deposit_invoice_status on public.deposit_invoice_payments;
create trigger trg_recompute_deposit_invoice_status
  after insert on public.deposit_invoice_payments
  for each row execute function public.recompute_deposit_invoice_status();

-- --- Mirror the invoice's status onto its sales order for cheap read/filter -----
create or replace function public.mirror_deposit_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'void' and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    update public.sales_orders set payment_status = new.status where id = new.sales_order_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_mirror_deposit_invoice_status on public.deposit_invoices;
create trigger trg_mirror_deposit_invoice_status
  after insert or update of status on public.deposit_invoices
  for each row execute function public.mirror_deposit_invoice_status();

-- --- RLS ---------------------------------------------------------------------------
-- Same shape as sales_orders/sales_order_items (0014_sales.sql): Owner / System
-- Admin / Sales Admin may read (prices live here too); Owner / Sales Admin may write.
alter table public.deposit_invoices          enable row level security;
alter table public.deposit_invoice_payments  enable row level security;

drop policy if exists deposit_invoices_select on public.deposit_invoices;
create policy deposit_invoices_select on public.deposit_invoices for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists deposit_invoices_write on public.deposit_invoices;
create policy deposit_invoices_write on public.deposit_invoices for all to authenticated
  using (public.auth_role() in ('owner', 'sales_admin'))
  with check (public.auth_role() in ('owner', 'sales_admin'));

drop policy if exists deposit_invoice_payments_select on public.deposit_invoice_payments;
create policy deposit_invoice_payments_select on public.deposit_invoice_payments for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists deposit_invoice_payments_write on public.deposit_invoice_payments;
create policy deposit_invoice_payments_write on public.deposit_invoice_payments for all to authenticated
  using (public.auth_role() in ('owner', 'sales_admin'))
  with check (public.auth_role() in ('owner', 'sales_admin'));

grant all on public.deposit_invoices to anon, authenticated, service_role;
grant all on public.deposit_invoice_payments to anon, authenticated, service_role;
grant all on public.deposit_invoice_seq to anon, authenticated, service_role;
