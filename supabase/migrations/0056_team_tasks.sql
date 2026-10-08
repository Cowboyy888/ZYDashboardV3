-- =============================================================================
-- Zysteel Operations — 0056 Team Task & Activity Tracking (MVP)
--
-- Daily task tracking across four departments (Marketing, B2B Sales, Field
-- Sales, Sales Assistant) plus a flexible daily activity ledger, so weekly
-- numbers are always SUM()'d from real entries rather than hand-typed
-- totals — same "ledger, not totals" posture as stock_movements/payment_
-- receipts. Sits alongside (does not touch) sales_inquiries/construction_
-- projects/sales_targets/kpi_scorecards, which already cover monthly B2B/
-- Field Sales pipeline tracking — this is a new, daily-grain, all-four-
-- departments layer (Marketing and Sales Assistant have no existing
-- coverage at all).
--
-- No employee self-service: employees has no link to profiles anywhere in
-- this schema (nobody but admin-tier roles can sign in), so — same as
-- Attendance — a manager/admin enters tasks and daily numbers for the team,
-- not each employee for themselves.
--
-- RLS policies below use the (select public.auth_role()) wrapped form from
-- the start (InitPlan-cached, evaluated once per query, not once per row) —
-- see 0053_optimize_rls_performance.sql for why the unwrapped form is wrong.
-- =============================================================================

-- --- Editable master lists -----------------------------------------------------

create table if not exists public.task_departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.task_departments (name, sort_order) values
  ('Marketing', 1),
  ('B2B Sales', 2),
  ('Field Sales', 3),
  ('Sales Assistant', 4)
on conflict (name) do nothing;

create table if not exists public.task_categories (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid not null references public.task_departments(id) on delete cascade,
  name           text not null,
  sort_order     int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (department_id, name)
);

insert into public.task_categories (department_id, name, sort_order)
select d.id, c.name, c.sort_order
from public.task_departments d
join (values
  ('Marketing', 'Facebook content', 1),
  ('Marketing', 'TikTok content', 2),
  ('Marketing', 'Facebook Ads', 3),
  ('Marketing', 'Website/SEO', 4),
  ('Marketing', 'Customer follow-up campaign', 5),
  ('Marketing', 'Poster/design', 6),
  ('Marketing', 'Market research', 7),
  ('Marketing', 'Competitor research', 8),
  ('Marketing', 'Lead generation', 9),
  ('B2B Sales', 'Contact new customer', 1),
  ('B2B Sales', 'Follow up existing customer', 2),
  ('B2B Sales', 'Send quotation', 3),
  ('B2B Sales', 'Negotiate price', 4),
  ('B2B Sales', 'Follow up quotation', 5),
  ('B2B Sales', 'Customer meeting', 6),
  ('B2B Sales', 'Order follow-up', 7),
  ('B2B Sales', 'Payment follow-up', 8),
  ('B2B Sales', 'Dealer/wholesaler development', 9),
  ('Field Sales', 'Visit construction site', 1),
  ('Field Sales', 'Visit hardware store', 2),
  ('Field Sales', 'Visit contractor', 3),
  ('Field Sales', 'Visit dealer', 4),
  ('Field Sales', 'Find site supervisor', 5),
  ('Field Sales', 'Collect customer contact', 6),
  ('Field Sales', 'Deliver sample', 7),
  ('Field Sales', 'Introduce ZY Steel factory', 8),
  ('Field Sales', 'Follow up previous visit', 9),
  ('Field Sales', 'Check competitor price', 10),
  ('Sales Assistant', 'Prepare quotation', 1),
  ('Sales Assistant', 'Prepare customer information', 2),
  ('Sales Assistant', 'Update CRM', 3),
  ('Sales Assistant', 'Follow up customer message', 4),
  ('Sales Assistant', 'Prepare document', 5),
  ('Sales Assistant', 'Record order', 6),
  ('Sales Assistant', 'Prepare sales report', 7),
  ('Sales Assistant', 'Support sales team', 8),
  ('Sales Assistant', 'Update customer database', 9)
) as c(department_name, name, sort_order) on c.department_name = d.name
on conflict (department_id, name) do nothing;

-- key is a stable, code-facing identifier (read by the domain layer), not a
-- surrogate uuid — same posture as inquiry_statuses.category's fixed values.
create table if not exists public.task_metric_types (
  key            text primary key,
  department_id  uuid references public.task_departments(id) on delete cascade,
  label_en       text not null,
  label_zh       text not null,
  sort_order     int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

insert into public.task_metric_types (key, department_id, label_en, label_zh, sort_order)
select m.key, d.id, m.label_en, m.label_zh, m.sort_order
from (values
  ('customer_contacts', null, 'Customer contacts', '客户联系', 1),
  ('visits', null, 'Visits', '拜访', 2),
  ('leads', null, 'Leads', '线索', 3),
  ('quotations', null, 'Quotations', '报价', 4),
  ('orders', null, 'Orders', '订单', 5),
  ('sales_value', null, 'Sales value', '销售额', 6),
  ('posts_published', 'Marketing', 'Posts published', '发布帖子', 7),
  ('videos_published', 'Marketing', 'Videos published', '发布视频', 8),
  ('messages_received', 'Marketing', 'Messages received', '收到消息', 9),
  ('campaigns_completed', 'Marketing', 'Campaigns completed', '完成活动', 10),
  ('sites_visited', 'Field Sales', 'Sites visited', '工地拜访', 11),
  ('stores_visited', 'Field Sales', 'Stores visited', '门店拜访', 12),
  ('new_contacts_collected', 'Field Sales', 'New contacts collected', '新增联系人', 13),
  ('samples_delivered', 'Field Sales', 'Samples delivered', '样品交付', 14),
  ('quotations_prepared', 'Sales Assistant', 'Quotations prepared', '准备报价', 15),
  ('customer_records_updated', 'Sales Assistant', 'Customer records updated', '更新客户记录', 16),
  ('documents_prepared', 'Sales Assistant', 'Documents prepared', '准备文件', 17),
  ('orders_processed', 'Sales Assistant', 'Orders processed', '处理订单', 18)
) as m(key, department_name, label_en, label_zh, sort_order)
left join public.task_departments d on d.name = m.department_name
on conflict (key) do nothing;

-- --- Tasks -----------------------------------------------------------------

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees(id) on delete cascade,
  department_id   uuid not null references public.task_departments(id) on delete restrict,
  category_id     uuid references public.task_categories(id) on delete set null,
  business_date   date not null default current_date,
  title           text not null,
  description     text,
  priority        text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  planned_start   time,
  planned_end     time,
  -- No stored 'overdue' — derived at read time as
  -- (business_date < today AND status in ('planned','in_progress')), same
  -- "derive, don't store" posture as stock_balances/payroll_items_live.
  status          text not null default 'planned'
                  check (status in ('planned', 'in_progress', 'completed', 'partially_completed', 'cancelled')),
  result          text,
  customer_id     uuid references public.customers(id) on delete set null,
  location        text,
  notes           text,
  attachment_path text,
  created_by      uuid references public.profiles(id) on delete set null,
  assigned_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists tasks_employee_date_idx on public.tasks (employee_id, business_date);
create index if not exists tasks_department_idx on public.tasks (department_id);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_customer_idx on public.tasks (customer_id);

drop trigger if exists trg_tasks_updated on public.tasks;
create trigger trg_tasks_updated before update on public.tasks
  for each row execute function public.set_updated_at();

-- --- Daily activity ledger ---------------------------------------------------
-- One editable row per (employee, date, metric) — corrections are direct
-- edits, same as `attendance`, not a second correcting ledger entry. Weekly/
-- monthly totals are always SUM(value) ... GROUP BY, never stored.

create table if not exists public.daily_metrics (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  business_date date not null default current_date,
  metric_key    text not null references public.task_metric_types(key) on delete restrict,
  value         numeric(14, 2) not null default 0,
  task_id       uuid references public.tasks(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (employee_id, business_date, metric_key)
);
create index if not exists daily_metrics_date_idx on public.daily_metrics (business_date);
create index if not exists daily_metrics_task_idx on public.daily_metrics (task_id);

drop trigger if exists trg_daily_metrics_updated on public.daily_metrics;
create trigger trg_daily_metrics_updated before update on public.daily_metrics
  for each row execute function public.set_updated_at();

-- --- RLS ---------------------------------------------------------------------

alter table public.task_departments enable row level security;
alter table public.task_categories enable row level security;
alter table public.task_metric_types enable row level security;
alter table public.tasks enable row level security;
alter table public.daily_metrics enable row level security;

drop policy if exists task_departments_select on public.task_departments;
create policy task_departments_select on public.task_departments for select to authenticated using (true);
drop policy if exists task_departments_write on public.task_departments;
create policy task_departments_write on public.task_departments for all to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin'))
  with check ((select public.auth_role()) in ('owner', 'system_admin'));

drop policy if exists task_categories_select on public.task_categories;
create policy task_categories_select on public.task_categories for select to authenticated using (true);
drop policy if exists task_categories_write on public.task_categories;
create policy task_categories_write on public.task_categories for all to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin'))
  with check ((select public.auth_role()) in ('owner', 'system_admin'));

drop policy if exists task_metric_types_select on public.task_metric_types;
create policy task_metric_types_select on public.task_metric_types for select to authenticated using (true);
drop policy if exists task_metric_types_write on public.task_metric_types;
create policy task_metric_types_write on public.task_metric_types for all to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin'))
  with check ((select public.auth_role()) in ('owner', 'system_admin'));

-- Same split as customers/sales_orders: owner/sales_admin write,
-- system_admin view-only.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks for all to authenticated
  using ((select public.auth_role()) in ('owner', 'sales_admin'))
  with check ((select public.auth_role()) in ('owner', 'sales_admin'));

drop policy if exists daily_metrics_select on public.daily_metrics;
create policy daily_metrics_select on public.daily_metrics for select to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin', 'sales_admin'));
drop policy if exists daily_metrics_write on public.daily_metrics;
create policy daily_metrics_write on public.daily_metrics for all to authenticated
  using ((select public.auth_role()) in ('owner', 'sales_admin'))
  with check ((select public.auth_role()) in ('owner', 'sales_admin'));
