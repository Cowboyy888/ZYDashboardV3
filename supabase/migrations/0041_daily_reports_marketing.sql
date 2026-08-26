-- =============================================================================
-- Zysteel Operations — 0041 Daily sales + marketing reports, marketing KPI
-- Sheets 01 (Daily Sales Report), 02 (Daily Marketing Report), 03 (Weekly),
-- 04 (Monthly) and 08 (Marketing KPI) of the Sales & Marketing Toolkit.
--
-- Only the DAILY sheets become tables. They carry activity the system cannot
-- observe for itself — calls made, messages sent, site visits, posts
-- published, ad spend. The weekly, monthly and marketing-KPI sheets are
-- roll-ups of those dailies plus data the app already holds (orders, pipeline,
-- targets), so they are computed, never stored: a stored weekly total is just
-- a copy that can disagree with its own source.
--
-- Formulas, transcribed:
--   Daily sales      M = IF(due = 0, 1, done / due)      follow-up compliance
--   Daily marketing  I = SUM(D:H)                        total leads
--                    L = ad spend / total leads          cost per lead
--   Weekly           J = revenue − cost,  K = J / revenue
--   Monthly          D = actual / target
--   Marketing KPI    cost per qualified = spend / qualified
--                    ROAS = gross profit / spend
-- =============================================================================

-- --- 01 · Daily sales report ---------------------------------------------------
-- One row per salesperson per day, submitted by 17:15.
create table if not exists public.daily_sales_reports (
  id                uuid primary key default gen_random_uuid(),
  business_date     date not null default current_date,
  employee_id       uuid not null references public.employees(id) on delete cascade,
  new_leads         int not null default 0 check (new_leads >= 0),
  calls             int not null default 0 check (calls >= 0),
  messages          int not null default 0 check (messages >= 0),
  follow_ups_done   int not null default 0 check (follow_ups_done >= 0),
  follow_ups_due    int not null default 0 check (follow_ups_due >= 0),
  field_visits      int not null default 0 check (field_visits >= 0),
  quotations        int not null default 0 check (quotations >= 0),
  quotation_value   numeric(16, 2) not null default 0 check (quotation_value >= 0),
  orders            int not null default 0 check (orders >= 0),
  order_value       numeric(16, 2) not null default 0 check (order_value >= 0),
  -- M = IF(due = 0, 1, done / due). Nothing due is full compliance, not a
  -- divide-by-zero and not a zero score.
  followup_compliance numeric(6, 4) generated always as (
    case when follow_ups_due = 0 then 1
         else least(1.0, follow_ups_done::numeric / follow_ups_due) end
  ) stored,
  best_opportunity  text,
  blocker           text,
  tomorrow_top3     text,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_date, employee_id)
);
create index if not exists daily_sales_date_idx on public.daily_sales_reports (business_date);

-- --- 02 · Daily marketing report -----------------------------------------------
-- One row per day for the whole department.
create table if not exists public.daily_marketing_reports (
  id                 uuid primary key default gen_random_uuid(),
  business_date      date not null default current_date unique,
  posts_published    int not null default 0 check (posts_published >= 0),
  posts_planned      int not null default 0 check (posts_planned >= 0),
  facebook_leads     int not null default 0 check (facebook_leads >= 0),
  tiktok_leads       int not null default 0 check (tiktok_leads >= 0),
  telegram_leads     int not null default 0 check (telegram_leads >= 0),
  google_leads       int not null default 0 check (google_leads >= 0),
  website_leads      int not null default 0 check (website_leads >= 0),
  -- I = SUM(D:H)
  total_leads        int generated always as (
    facebook_leads + tiktok_leads + telegram_leads + google_leads + website_leads
  ) stored,
  median_response_min int check (median_response_min >= 0),
  ad_spend           numeric(14, 2) not null default 0 check (ad_spend >= 0),
  -- L = K / I. NULL (not zero) when no leads came in — a cost per lead of zero
  -- would read as "free leads" rather than "no leads".
  cost_per_lead      numeric(14, 4) generated always as (
    case when (facebook_leads + tiktok_leads + telegram_leads + google_leads + website_leads) > 0
         then ad_spend / (facebook_leads + tiktok_leads + telegram_leads + google_leads + website_leads)
         else null end
  ) stored,
  best_post          text,
  note               text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists daily_marketing_date_idx on public.daily_marketing_reports (business_date);

-- --- 08 · Marketing settings ----------------------------------------------------
-- The workbook derives marketing gross profit as revenue × a single margin
-- assumption (its cell $B$41). Keeping it here makes that assumption explicit
-- and editable rather than buried in a formula.
create table if not exists public.marketing_settings (
  id                     int primary key default 1 check (id = 1),
  gross_margin_assumption numeric(5, 4) not null default 0.18
                         check (gross_margin_assumption >= 0 and gross_margin_assumption <= 1),
  updated_at             timestamptz not null default now()
);
insert into public.marketing_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_daily_sales_updated on public.daily_sales_reports;
create trigger trg_daily_sales_updated before update on public.daily_sales_reports
  for each row execute function public.set_updated_at();
drop trigger if exists trg_daily_marketing_updated on public.daily_marketing_reports;
create trigger trg_daily_marketing_updated before update on public.daily_marketing_reports
  for each row execute function public.set_updated_at();

-- --- RLS -------------------------------------------------------------------------
alter table public.daily_sales_reports     enable row level security;
alter table public.daily_marketing_reports enable row level security;
alter table public.marketing_settings      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['daily_sales_reports','daily_marketing_reports','marketing_settings'] loop
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

grant all on public.daily_sales_reports to anon, authenticated, service_role;
grant all on public.daily_marketing_reports to anon, authenticated, service_role;
grant all on public.marketing_settings to anon, authenticated, service_role;
