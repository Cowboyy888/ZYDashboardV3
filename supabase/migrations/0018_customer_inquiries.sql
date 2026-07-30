-- =============================================================================
-- Zysteel Operations — 0018 Customer Price Inquiries (quotation tracking)
-- Models the "客户询价报告 / Customer Price Inquiry Report" workbook as a proper
-- DB-backed module: a pre-sale quotation tracker with follow-ups and a summary
-- dashboard. Reuses existing master data — customers, product_families,
-- employees (salespeople) — and adds two small editable lists (customer types,
-- statuses). Prices are per square metre ($/m²), matching the template.
--
-- Derived, never stored by hand (Postgres GENERATED columns, like the rest of
-- the app derives balances): price_difference, estimated_profit, quotation_value.
-- Access mirrors the Sales module: owner / system_admin / sales_admin.
-- =============================================================================

-- --- Editable lists -----------------------------------------------------------
create table if not exists public.inquiry_customer_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Status carries a `category` so the dashboard can compute won/lost/conversion
-- regardless of how the display names are edited.
create table if not exists public.inquiry_statuses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text not null default 'open' check (category in ('open', 'won', 'lost')),
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- --- Inquiries ----------------------------------------------------------------
create table if not exists public.sales_inquiries (
  id                uuid primary key default gen_random_uuid(),
  inquiry_no        text unique,
  inquiry_date      date not null default current_date,
  salesperson_id    uuid references public.employees(id) on delete set null,
  customer_id       uuid references public.customers(id) on delete set null,
  customer_name     text not null,
  company_name      text,
  contact           text,
  customer_type_id  uuid references public.inquiry_customer_types(id) on delete set null,
  family_id         uuid references public.product_families(id) on delete set null,
  specification     text,
  diameter          text,
  sheet_size        text,
  area_per_sheet    numeric(14, 3),
  mesh_opening      text,
  quantity          numeric(14, 2),
  delivery_location text,
  factory_cost      numeric(14, 4),
  quoted_price      numeric(14, 4),
  target_price      numeric(14, 4),
  final_price       numeric(14, 4),
  status_id         uuid references public.inquiry_statuses(id) on delete set null,
  follow_up_date    date,
  follow_up_notes   text,
  next_action       text,
  remarks           text,
  -- Auto-calculated (grey columns in the workbook). Sell price = final if
  -- negotiated, else quoted. NULL when the inputs they need are missing.
  price_difference  numeric(14, 4) generated always as (quoted_price - target_price) stored,
  quotation_value   numeric(18, 4) generated always as (quoted_price * area_per_sheet * quantity) stored,
  estimated_profit  numeric(18, 4) generated always as (
                      (coalesce(final_price, quoted_price) - factory_cost) * area_per_sheet * quantity
                    ) stored,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists inquiries_status_idx on public.sales_inquiries (status_id);
create index if not exists inquiries_salesperson_idx on public.sales_inquiries (salesperson_id);
create index if not exists inquiries_family_idx on public.sales_inquiries (family_id);
create index if not exists inquiries_date_idx on public.sales_inquiries (inquiry_date);

-- --- Follow-up interactions (running log per inquiry) --------------------------
create table if not exists public.inquiry_followups (
  id                  uuid primary key default gen_random_uuid(),
  inquiry_id          uuid not null references public.sales_inquiries(id) on delete cascade,
  follow_up_date      date not null default current_date,
  previous_action     text,
  customer_response   text,
  next_follow_up_date date,
  responsible_id      uuid references public.employees(id) on delete set null,
  status_id           uuid references public.inquiry_statuses(id) on delete set null,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists inquiry_followups_inquiry_idx on public.inquiry_followups (inquiry_id);

-- --- Inquiry number: ZY-YYYY-###, atomic, resets per calendar year ------------
create table if not exists public.sales_inquiry_seq (
  year      int primary key,
  next_seq  int not null default 1
);

create or replace function public.assign_inquiry_no()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  y int := extract(year from coalesce(new.inquiry_date, current_date))::int;
  n int;
begin
  if new.inquiry_no is null or length(btrim(new.inquiry_no)) = 0 then
    insert into public.sales_inquiry_seq (year, next_seq) values (y, 1)
      on conflict (year) do update set next_seq = public.sales_inquiry_seq.next_seq + 1
      returning next_seq into n;
    new.inquiry_no := 'ZY-' || y || '-' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_inquiry_no on public.sales_inquiries;
create trigger trg_assign_inquiry_no
  before insert on public.sales_inquiries
  for each row execute function public.assign_inquiry_no();

drop trigger if exists trg_inquiries_updated on public.sales_inquiries;
create trigger trg_inquiries_updated before update on public.sales_inquiries
  for each row execute function public.set_updated_at();

-- --- RLS: owner / system_admin / sales_admin (mirrors the Sales module) --------
alter table public.inquiry_customer_types enable row level security;
alter table public.inquiry_statuses       enable row level security;
alter table public.sales_inquiries        enable row level security;
alter table public.inquiry_followups      enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'inquiry_customer_types','inquiry_statuses','sales_inquiries','inquiry_followups'
  ] loop
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

-- Sales Admin needs to read employees to pick a salesperson / responsible person
-- (the 0003 baseline predates the sales roles). Salary stays protected — it
-- lives in employee_private under its own stricter policy.
drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
  using (public.auth_role() in
    ('owner','system_admin','payroll_admin','attendance_admin','sales_admin','viewer'));

-- --- Grants (explicit; 0011 default privileges also cover future objects) ------
grant all on public.inquiry_customer_types to anon, authenticated, service_role;
grant all on public.inquiry_statuses to anon, authenticated, service_role;
grant all on public.sales_inquiries to anon, authenticated, service_role;
grant all on public.inquiry_followups to anon, authenticated, service_role;
grant all on public.sales_inquiry_seq to anon, authenticated, service_role;

-- --- Seed the two lists from the template -------------------------------------
insert into public.inquiry_customer_types (name, sort_order) values
  ('中间商(Distributor)', 1), ('工地（Constuction）', 2),
  ('零售（Retail）', 3), ('政府(Government)', 4)
on conflict (name) do nothing;

insert into public.inquiry_statuses (name, category, sort_order) values
  ('新查询', 'open', 1), ('报价已发送', 'open', 2), ('正在沟通', 'open', 3),
  ('等回复', 'open', 4), ('成交', 'won', 5), ('跑单', 'lost', 6)
on conflict (name) do nothing;
