-- =============================================================================
-- Zysteel Operations — 0001 schema
-- Core tables. All times are timestamptz (UTC); operational records also carry a
-- local `business_date` so day boundaries are unambiguous in Asia/Phnom_Penh.
-- =============================================================================

create extension if not exists "pgcrypto";

-- --- Roles enum (mirrors src/lib/domain/rbac.ts) -----------------------------
do $$ begin
  create type app_role as enum (
    'owner','system_admin','attendance_admin','warehouse_admin',
    'sales_admin','payroll_admin','viewer'
  );
exception when duplicate_object then null; end $$;

-- --- Profiles (1:1 with auth.users) ------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        app_role not null default 'viewer',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- --- Locations (editable master data) ----------------------------------------
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- --- Product families + SKUs (editable master data) --------------------------
create table if not exists public.product_families (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  default_unit  text not null default '张',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.skus (
  id             uuid primary key default gen_random_uuid(),
  family_id      uuid not null references public.product_families(id) on delete restrict,
  diameter       text,
  size           text,
  hole           text,
  rod_count      text,
  extra          text,
  condition      text not null default 'normal'
                 check (condition in ('normal','old','rough_edge','damaged')),
  unit           text not null default '张',
  minimum_level  numeric(14,3) not null default 0 check (minimum_level >= 0),
  is_active      boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now()
);

-- Every unique attribute combination is a distinct SKU.
create unique index if not exists skus_signature_uidx on public.skus (
  family_id,
  coalesce(lower(diameter),''),
  coalesce(lower(size),''),
  coalesce(lower(hole),''),
  coalesce(lower(rod_count),''),
  coalesce(lower(extra),''),
  condition,
  lower(unit)
);

-- --- Append-only stock movement ledger ---------------------------------------
create table if not exists public.stock_movements (
  id                 uuid primary key default gen_random_uuid(),
  sku_id             uuid not null references public.skus(id) on delete restrict,
  location_id        uuid not null references public.locations(id) on delete restrict,
  type               text not null check (type in (
                       'opening_balance','purchase_receipt','production_output',
                       'sale_delivery','other_stock_out','adjustment',
                       'transfer_out','transfer_in')),
  quantity           numeric(14,3) not null,
  business_date      date not null,
  transfer_group_id  uuid,
  override_reason    text,
  notes              text,
  attachment_path    text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  -- Sign convention keeps SUM(quantity) == balance.
  constraint stock_movements_sign_chk check (
    (type in ('opening_balance','purchase_receipt','production_output','transfer_in') and quantity > 0)
    or (type in ('sale_delivery','other_stock_out','transfer_out') and quantity < 0)
    or (type = 'adjustment' and quantity <> 0)
  )
);
create index if not exists stock_movements_sku_loc_idx on public.stock_movements (sku_id, location_id);
create index if not exists stock_movements_business_date_idx on public.stock_movements (business_date);
create index if not exists stock_movements_transfer_grp_idx on public.stock_movements (transfer_group_id);

-- Live balances (never stored as an editable total). security_invoker so the
-- view respects the querying user's RLS on stock_movements.
create or replace view public.stock_balances
  with (security_invoker = on) as
  select sku_id, location_id, sum(quantity)::numeric(14,3) as quantity
  from public.stock_movements
  group by sku_id, location_id;

-- --- Employees (non-sensitive) -----------------------------------------------
create table if not exists public.employees (
  id              uuid primary key default gen_random_uuid(),
  employee_code   text not null unique,
  name_khmer      text,
  name_english    text,
  name_chinese    text,
  phone           text,
  department      text,
  position        text,
  start_date      date,
  is_active       boolean not null default true,
  pay_type        text not null default 'monthly' check (pay_type in ('monthly','daily')),
  photo_path      text,
  notes           text,
  created_at      timestamptz not null default now()
);

-- --- Employee sensitive data (separate table => column-level protection) ------
-- Salary/pay fields + emergency contact live here and are guarded by strict RLS
-- so only Owner / System Admin / Payroll Admin can read them.
create table if not exists public.employee_private (
  employee_id        uuid primary key references public.employees(id) on delete cascade,
  base_salary        numeric(14,2),
  daily_rate         numeric(14,2),
  emergency_contact  text,
  updated_at         timestamptz not null default now()
);

-- --- Attendance (one row per employee/date/shift) ----------------------------
create table if not exists public.attendance (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id) on delete cascade,
  business_date  date not null,
  shift          text not null check (shift in ('morning','afternoon')),
  status         text not null check (status in ('present','late','leave','absent')),
  notes          text,
  created_by     uuid references public.profiles(id) on delete set null,
  updated_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, business_date, shift)
);
create index if not exists attendance_date_shift_idx on public.attendance (business_date, shift);

-- --- Immutable audit log ------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_email  text,
  action       text not null,
  entity       text not null,
  entity_id    text,
  old_value    jsonb,
  new_value    jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- --- Sent reports (Telegram idempotency) -------------------------------------
create table if not exists public.sent_reports (
  id            uuid primary key default gen_random_uuid(),
  report_key    text not null unique,
  report_type   text not null,
  business_date date not null,
  chat_id       text,
  status        text not null default 'sent' check (status in ('sent','failed')),
  detail        text,
  created_at    timestamptz not null default now()
);

-- --- Telegram settings (single row) ------------------------------------------
create table if not exists public.telegram_settings (
  id                 int primary key default 1 check (id = 1),
  chat_id            text,
  morning_enabled    boolean not null default true,
  afternoon_enabled  boolean not null default true,
  inventory_enabled  boolean not null default true,
  inventory_time     text not null default '18:00',
  updated_at         timestamptz not null default now()
);
insert into public.telegram_settings (id) values (1) on conflict (id) do nothing;
