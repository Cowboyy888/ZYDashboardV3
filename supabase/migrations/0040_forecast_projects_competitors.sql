-- =============================================================================
-- Zysteel Operations — 0040 Forecast, project database, competitor prices
-- Sheets 17 (Sales Forecast), 13 (Construction Project Database) and
-- 12 (Competitor Analysis) of the Sales & Marketing Toolkit.
--
-- The forecast is deliberately NOT a table. Sheet 17 restates the same deals
-- as sheet 06 (id, customer, stage, value, probability, weighted) — copying
-- them into a second table is exactly the duplicate-source-of-truth the
-- toolkit warns against. Instead the pipeline gains the three fields the
-- forecast needs that it did not already hold, and the forecast is a view
-- over it.
--
-- The other two sheets ARE new entities: construction projects are demand that
-- exists before any deal does, and competitor prices are observations about
-- other companies. Neither belongs on an inquiry.
-- =============================================================================

-- --- 17 · Forecast fields on the pipeline ------------------------------------
alter table public.sales_inquiries
  add column if not exists expected_close_date date;
alter table public.sales_inquiries
  add column if not exists tonnage numeric(14, 3);
alter table public.sales_inquiries
  add column if not exists confidence_note text;

create index if not exists inquiries_expected_close_idx
  on public.sales_inquiries (expected_close_date);

-- The forecast: every open deal with an expected close date, weighted.
-- security_invoker so RLS on sales_inquiries still governs who sees what.
create or replace view public.sales_forecast
  with (security_invoker = on) as
  select
    i.id,
    i.inquiry_no,
    i.customer_name,
    i.salesperson_id,
    i.family_id,
    s.name             as stage_name,
    s.category         as stage_category,
    i.quotation_value  as value,
    i.probability,
    i.weighted_value,
    i.expected_close_date,
    i.tonnage,
    i.confidence_note
  from public.sales_inquiries i
  left join public.inquiry_statuses s on s.id = i.status_id
  where coalesce(s.category, 'open') = 'open';

-- --- 13 · Construction project database --------------------------------------
-- Find projects BEFORE they buy: a piling rig on site means mesh is needed
-- within months. Stage drives the buying window.
create table if not exists public.construction_projects (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  developer             text,
  main_contractor       text,
  subcontractors        text,
  district              text,
  project_type          text,                       -- Borey / condo / factory …
  estimated_size        text,                       -- free text, e.g. "180 units"
  construction_stage    text not null default 'land_permit'
                        check (construction_stage in (
                          'land_permit', 'site_clearing', 'piling', 'foundation',
                          'slabs', 'structure', 'finishing', 'complete')),
  contact_person        text,
  contact_role          text,
  contact_phone         text,
  products_required     text,
  estimated_tonnage     numeric(14, 3),
  expected_purchase_month text,                     -- YYYY-MM
  current_supplier      text,
  estimated_value       numeric(16, 2),
  salesperson_id        uuid references public.employees(id) on delete set null,
  next_action           text,
  next_action_date      date,
  photos_taken          text,
  notes                 text,
  is_active             boolean not null default true,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists projects_stage_idx on public.construction_projects (construction_stage);
create index if not exists projects_purchase_month_idx
  on public.construction_projects (expected_purchase_month);
create index if not exists projects_next_action_idx
  on public.construction_projects (next_action_date);

-- --- 12 · Competitor price observations ---------------------------------------
-- A price is meaningless without its specification, so specification is NOT
-- NULL: the workbook's first instruction is never to record one without the
-- other.
create table if not exists public.competitor_prices (
  id                uuid primary key default gen_random_uuid(),
  competitor        text not null,
  competitor_kind   text not null default 'factory'
                    check (competitor_kind in ('factory', 'trader', 'unknown')),
  product           text,
  specification     text not null,
  price             numeric(14, 4) not null check (price >= 0),
  unit              text not null default 'sheet',
  price_basis       text not null default 'ex_works'
                    check (price_basis in ('ex_works', 'delivered')),
  observed_on       date not null default current_date,
  information_source text,                          -- e.g. "Lost quotation — X"
  lead_time         text,
  payment_terms     text,
  coverage_area     text,
  strengths         text,
  weaknesses        text,
  how_we_win        text,
  deals_won_vs      int not null default 0 check (deals_won_vs >= 0),
  deals_lost_to     int not null default 0 check (deals_lost_to >= 0),
  notes             text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists competitor_name_idx on public.competitor_prices (competitor);
create index if not exists competitor_observed_idx on public.competitor_prices (observed_on);

drop trigger if exists trg_projects_updated on public.construction_projects;
create trigger trg_projects_updated before update on public.construction_projects
  for each row execute function public.set_updated_at();
drop trigger if exists trg_competitor_updated on public.competitor_prices;
create trigger trg_competitor_updated before update on public.competitor_prices
  for each row execute function public.set_updated_at();

-- --- RLS: same shape as the rest of the Sales module ---------------------------
alter table public.construction_projects enable row level security;
alter table public.competitor_prices     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['construction_projects','competitor_prices'] loop
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

grant all on public.construction_projects to anon, authenticated, service_role;
grant all on public.competitor_prices to anon, authenticated, service_role;
grant select on public.sales_forecast to anon, authenticated, service_role;
