-- =============================================================================
-- Zysteel Operations — 0046 Price Record / Price History
--
-- A central, append-only price ledger — "what price did we give this
-- product/customer before, and when?" — genuinely new (confirmed: no
-- price_list/customer_price/special_price concept existed anywhere before
-- this). Links to the existing skus (one row already = one full
-- product+specification, via skus_signature_uidx) and customers tables
-- rather than duplicating either.
--
-- price_types is a small editable list, same shape and reasoning as
-- inquiry_customer_types (0018): the business wants price categories
-- (Standard/Customer/Wholesale/Project/Special/Promotional) expandable later
-- without a migration, exactly like inquiry customer types/statuses already
-- are.
--
-- "Never overwrite a historical price" is enforced in the application layer
-- (createPriceRecord auto-expires the previous active row in the same
-- sku_id/customer_id/price_type_id context before inserting the new one),
-- not a DB unique constraint — customer_id is nullable (standard prices have
-- none), which would make a clean partial unique index awkward, and this
-- repo already keeps this class of business rule in domain/action code
-- rather than the schema (e.g. commission band resolution).
-- =============================================================================

-- --- Price types (editable list, same shape as inquiry_customer_types) --------
create table if not exists public.price_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.price_types (name, sort_order) values
  ('Standard Price', 1),
  ('Customer Price', 2),
  ('Wholesale Price', 3),
  ('Project Price', 4),
  ('Special Price', 5),
  ('Promotional Price', 6)
on conflict (name) do nothing;

-- --- Price records --------------------------------------------------------------
create table if not exists public.price_records (
  id                 uuid primary key default gen_random_uuid(),
  sku_id             uuid not null references public.skus(id) on delete restrict,
  -- Null = not customer-specific (standard/wholesale/promotional pricing).
  customer_id        uuid references public.customers(id) on delete set null,
  price_type_id      uuid not null references public.price_types(id) on delete restrict,
  price              numeric(14, 4) not null check (price >= 0),
  currency           text not null check (currency in ('USD', 'KHR', 'CNY')),
  unit               text not null,
  minimum_quantity   numeric(14, 3) check (minimum_quantity >= 0),
  effective_date     date not null,
  expiry_date        date check (expiry_date is null or expiry_date >= effective_date),
  status             text not null default 'active'
                     check (status in ('active', 'expired', 'cancelled')),
  notes              text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists price_records_sku_idx on public.price_records (sku_id);
create index if not exists price_records_customer_idx on public.price_records (customer_id);
create index if not exists price_records_status_idx on public.price_records (status);
create index if not exists price_records_effective_idx on public.price_records (effective_date);
-- The "current price for this sku+customer+type" / auto-supersede lookup.
create index if not exists price_records_context_idx
  on public.price_records (sku_id, customer_id, price_type_id);

drop trigger if exists trg_price_records_updated on public.price_records;
create trigger trg_price_records_updated before update on public.price_records
  for each row execute function public.set_updated_at();

-- --- RLS ------------------------------------------------------------------------
-- Same posture as sales_targets/kpi_scorecards (0039): sales-adjacent master
-- data, owner/system_admin/sales_admin.
alter table public.price_types   enable row level security;
alter table public.price_records enable row level security;

do $$
declare t text;
begin
  foreach t in array array['price_types', 'price_records'] loop
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

grant all on public.price_types to anon, authenticated, service_role;
grant all on public.price_records to anon, authenticated, service_role;
