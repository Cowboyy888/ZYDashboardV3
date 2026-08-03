-- =============================================================================
-- Zysteel Operations — 0020 Quotations & deposit/balance invoices
-- Models ZY_Steel_Quotation.xlsx: ONE record holds the customer, the line items
-- and the deposit percentage; three documents are issued from it —
--   Quotation        ZYS-Q{YYMM}-###
--   Deposit invoice  ZYS-DP{YYMM}-###   Subtotal × deposit_pct
--   Balance invoice  ZYS-BL{YYMM}-###   Subtotal − deposit
--
-- Money is derived, never hand-entered: line amount, subtotal, deposit and
-- balance are GENERATED columns / views, mirroring the workbook's formulas
-- (F14 = D14*E14, F16 = SUM, F17 = F16*C18, F18 = F16-F17).
--
-- A document number is assigned ONCE, the first time that document is issued,
-- and then never changes — so a PDF handed to a customer always keeps its
-- reference (the balance invoice cites the deposit invoice it offsets).
-- =============================================================================

create table if not exists public.quotations (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid references public.customers(id) on delete restrict,
  customer_name       text not null,
  contact             text,
  project_site        text,
  quotation_date      date not null default current_date,
  valid_days          int not null default 15 check (valid_days >= 0),
  currency            text not null default 'USD' check (currency in ('USD', 'KHR', 'CNY')),
  -- Deposit share of the contract value (0.30 = 30%). Varies per deal.
  deposit_pct         numeric(5, 4) not null default 0.30 check (deposit_pct >= 0 and deposit_pct <= 1),
  pricing_basis       text,   -- e.g. "Rate (USD per m²)" / per roll
  terms               text,   -- overrides the default terms block when set
  notes               text,
  -- Document numbers + issue dates (assigned on first generate, then frozen).
  quotation_no        text unique,
  quotation_issued_on date,
  deposit_no          text unique,
  deposit_issued_on   date,
  balance_no          text unique,
  balance_issued_on   date,
  deposit_paid_on     date,
  balance_paid_on     date,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists quotations_customer_idx on public.quotations (customer_id);
create index if not exists quotations_date_idx on public.quotations (quotation_date);

create table if not exists public.quotation_items (
  id            uuid primary key default gen_random_uuid(),
  quotation_id  uuid not null references public.quotations(id) on delete cascade,
  line_no       int not null default 1,
  description   text not null,
  wire_dia      text,
  steel_grade   text,
  unit          text not null default 'm²',
  unit_price    numeric(14, 4) not null default 0 check (unit_price >= 0),
  quantity      numeric(14, 3) not null default 0 check (quantity >= 0),
  -- F14 = D14 * E14
  amount        numeric(16, 4) generated always as (round(unit_price * quantity, 4)) stored,
  created_at    timestamptz not null default now()
);
create index if not exists quotation_items_quotation_idx on public.quotation_items (quotation_id);

-- Contract subtotal per quotation, derived from the lines (F16 = SUM).
create or replace view public.quotation_totals
  with (security_invoker = on) as
  select quotation_id, sum(amount)::numeric(16, 4) as subtotal, count(*)::int as line_count
  from public.quotation_items
  group by quotation_id;

-- --- Document numbering: ZYS-{Q|DP|BL}{YYMM}-###, atomic, resets per month ----
create table if not exists public.quotation_doc_seq (
  kind      text not null check (kind in ('Q', 'DP', 'BL')),
  period    text not null,          -- YYMM
  next_seq  int not null default 1,
  primary key (kind, period)
);

/**
 * Assign (once) and return the document number for a quotation + document kind.
 * Idempotent: calling it again returns the number already stored, so a PDF can
 * be regenerated without burning a new sequence number.
 */
create or replace function public.issue_quotation_document(
  p_quotation uuid,
  p_kind text,
  p_issue_date date default current_date
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_period text := to_char(coalesce(p_issue_date, current_date), 'YYMM');
  v_existing text;
  n int;
  v_no text;
begin
  if p_kind not in ('Q', 'DP', 'BL') then
    raise exception 'Unknown document kind %', p_kind;
  end if;

  select case p_kind when 'Q' then quotation_no when 'DP' then deposit_no else balance_no end
    into v_existing from public.quotations where id = p_quotation;
  if v_existing is not null and length(btrim(v_existing)) > 0 then
    return v_existing;                       -- already issued — keep the number
  end if;

  insert into public.quotation_doc_seq (kind, period, next_seq) values (p_kind, v_period, 1)
    on conflict (kind, period) do update set next_seq = public.quotation_doc_seq.next_seq + 1
    returning next_seq into n;

  v_no := 'ZYS-' || p_kind || v_period || '-' || lpad(n::text, 3, '0');

  if p_kind = 'Q' then
    update public.quotations
       set quotation_no = v_no, quotation_issued_on = coalesce(p_issue_date, current_date)
     where id = p_quotation;
  elsif p_kind = 'DP' then
    update public.quotations
       set deposit_no = v_no, deposit_issued_on = coalesce(p_issue_date, current_date)
     where id = p_quotation;
  else
    update public.quotations
       set balance_no = v_no, balance_issued_on = coalesce(p_issue_date, current_date)
     where id = p_quotation;
  end if;

  return v_no;
end $$;

drop trigger if exists trg_quotations_updated on public.quotations;
create trigger trg_quotations_updated before update on public.quotations
  for each row execute function public.set_updated_at();

-- --- RLS: same shape as the Sales module -------------------------------------
alter table public.quotations      enable row level security;
alter table public.quotation_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['quotations','quotation_items'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated '
      || 'using (public.auth_role() in (''owner'',''system_admin'',''sales_admin''))', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated '
      || 'using (public.auth_role() in (''owner'',''system_admin'',''sales_admin'')) '
      || 'with check (public.auth_role() in (''owner'',''system_admin'',''sales_admin''))', t, t);
  end loop;
end $$;

grant all on public.quotations to anon, authenticated, service_role;
grant all on public.quotation_items to anon, authenticated, service_role;
grant all on public.quotation_doc_seq to anon, authenticated, service_role;
grant execute on function public.issue_quotation_document(uuid, text, date) to authenticated;
