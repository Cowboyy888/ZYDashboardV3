-- =============================================================================
-- Zysteel Operations — 0038 CRM pipeline (Sales & Marketing Toolkit, sheet 06)
--
-- Turns the existing inquiry "status" into the workbook's 12-stage pipeline
-- rather than introducing a second, competing concept — the toolkit's own
-- warning is that the pipeline must be a SINGLE source of truth. Existing
-- statuses keep their ids and rows; they simply gain a stage order and a
-- default probability, and the stages the workbook defines but this database
-- lacked are seeded alongside them.
--
-- Derived, never hand-entered:
--   weighted_value = quoted_price × area_per_sheet × quantity × probability
--                    (workbook: O = M × N)
-- Postgres forbids one generated column referencing another, so the weighted
-- value repeats quotation_value's expression rather than multiplying it.
--
-- `probability` is SNAPSHOTTED onto each inquiry from its stage (same pattern
-- as the overtime rate snapshot in 0019): re-tuning a stage's default
-- probability never silently re-forecasts deals already in flight.
-- =============================================================================

-- --- Stages: extend the existing status list ---------------------------------
alter table public.inquiry_statuses
  add column if not exists probability numeric(5, 4) not null default 0
    check (probability >= 0 and probability <= 1);

-- Probabilities + ordering for the statuses seeded in 0018.
update public.inquiry_statuses set sort_order = 1,  probability = 0.10 where name = '新查询';
update public.inquiry_statuses set sort_order = 4,  probability = 0.40 where name = '报价已发送';
update public.inquiry_statuses set sort_order = 6,  probability = 0.65 where name = '正在沟通';
update public.inquiry_statuses set sort_order = 5,  probability = 0.50 where name = '等回复';
update public.inquiry_statuses set sort_order = 8,  probability = 1.00 where name = '成交';
update public.inquiry_statuses set sort_order = 99, probability = 0.00 where name = '跑单';

-- The stages the workbook defines that 0018 did not seed.
insert into public.inquiry_statuses (name, category, sort_order, probability) values
  ('已联系 Contacted',        'open', 2,  0.20),
  ('已确认需求 Qualified',    'open', 3,  0.30),
  ('已收订金 Deposit',        'open', 7,  0.90),
  ('生产中 Production',       'won',  9,  1.00),
  ('发货中 Delivery',         'won',  10, 1.00),
  ('已完成 Completed',        'won',  11, 1.00),
  ('回头客 Repeat Customer',  'won',  12, 1.00)
on conflict (name) do nothing;

-- --- Lead sources (workbook: Lists!C) ----------------------------------------
create table if not exists public.inquiry_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.inquiry_sources (name, sort_order) values
  ('Facebook', 1), ('TikTok', 2), ('Telegram', 3), ('Google', 4),
  ('Website', 5), ('Field visit 实地拜访', 6), ('Referral 转介绍', 7),
  ('Dealer 经销商', 8), ('Event 活动', 9), ('Walk-in 上门', 10), ('Other 其他', 11)
on conflict (name) do nothing;

-- --- Loss reasons (workbook: Lists!F) ----------------------------------------
-- Coded so losses can be pattern-hunted rather than argued about.
create table if not exists public.inquiry_loss_reasons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.inquiry_loss_reasons (code, name, sort_order) values
  ('L1', 'Price 价格',              1),
  ('L2', 'Lead time 交期',          2),
  ('L3', 'Specification 规格',      3),
  ('L4', 'Payment terms 付款条件',  4),
  ('L5', 'Relationship 关系',       5),
  ('L6', 'Project cancelled 项目取消', 6),
  ('L7', 'No decision 未决定',      7),
  ('L8', 'Internal failure 内部原因', 8)
on conflict (code) do nothing;

-- --- Pipeline columns on the inquiry -----------------------------------------
alter table public.sales_inquiries
  add column if not exists source_id uuid references public.inquiry_sources(id) on delete set null;
alter table public.sales_inquiries
  add column if not exists loss_reason_id uuid references public.inquiry_loss_reasons(id) on delete set null;
alter table public.sales_inquiries
  add column if not exists project text;
alter table public.sales_inquiries
  add column if not exists last_contact date;
alter table public.sales_inquiries
  add column if not exists probability numeric(5, 4) not null default 0
    check (probability >= 0 and probability <= 1);

-- Workbook O = M × N, expanded because quotation_value is itself generated.
alter table public.sales_inquiries
  add column if not exists weighted_value numeric(18, 4) generated always as (
    quoted_price * area_per_sheet * quantity * probability
  ) stored;

create index if not exists inquiries_source_idx on public.sales_inquiries (source_id);
create index if not exists inquiries_followup_idx on public.sales_inquiries (follow_up_date);

-- Snapshot the stage's default probability when the caller does not set one,
-- and re-snapshot when the stage changes (unless the caller supplied a value).
create or replace function public.apply_inquiry_probability()
returns trigger language plpgsql security definer set search_path = public as $$
declare p numeric;
begin
  if tg_op = 'INSERT' then
    if new.probability = 0 and new.status_id is not null then
      select probability into p from public.inquiry_statuses where id = new.status_id;
      new.probability := coalesce(p, 0);
    end if;
  elsif new.status_id is distinct from old.status_id and new.probability = old.probability then
    select probability into p from public.inquiry_statuses where id = new.status_id;
    new.probability := coalesce(p, old.probability);
  end if;
  return new;
end $$;

drop trigger if exists trg_inquiry_probability on public.sales_inquiries;
create trigger trg_inquiry_probability before insert or update on public.sales_inquiries
  for each row execute function public.apply_inquiry_probability();

-- Backfill probabilities for inquiries created before this migration.
update public.sales_inquiries i
   set probability = s.probability
  from public.inquiry_statuses s
 where i.status_id = s.id and i.probability = 0;

-- --- RLS: same shape as the rest of the Sales module -------------------------
alter table public.inquiry_sources       enable row level security;
alter table public.inquiry_loss_reasons  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['inquiry_sources','inquiry_loss_reasons'] loop
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

grant all on public.inquiry_sources to anon, authenticated, service_role;
grant all on public.inquiry_loss_reasons to anon, authenticated, service_role;
