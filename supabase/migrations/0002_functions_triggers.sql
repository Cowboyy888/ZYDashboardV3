-- =============================================================================
-- Zysteel Operations — 0002 functions & triggers
-- Business invariants enforced in the database so they hold regardless of the
-- calling code: non-negative stock (with Owner override), append-only ledger &
-- audit log, no hard-deletes of stock/attendance, auto profile on signup.
-- =============================================================================

-- Role of the current user (used by RLS + triggers). SECURITY DEFINER so it can
-- read profiles regardless of the caller's own RLS.
create or replace function public.auth_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- --- Non-negative stock guard (Owner override with recorded reason) ----------
create or replace function public.enforce_stock_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  current_balance numeric;
  new_balance numeric;
  actor_role app_role;
begin
  select coalesce(sum(quantity), 0) into current_balance
    from public.stock_movements
    where sku_id = new.sku_id and location_id = new.location_id;

  new_balance := current_balance + new.quantity;

  if new_balance < 0 then
    if new.override_reason is null or length(btrim(new.override_reason)) = 0 then
      raise exception
        'NEGATIVE_STOCK_BLOCKED: movement would drive balance to %; an Owner override with a recorded reason is required',
        new_balance;
    end if;
    actor_role := public.auth_role();
    if actor_role is distinct from 'owner' then
      raise exception 'NEGATIVE_STOCK_OVERRIDE_FORBIDDEN: only an Owner may override negative stock';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_enforce_stock_rules on public.stock_movements;
create trigger trg_enforce_stock_rules
  before insert on public.stock_movements
  for each row execute function public.enforce_stock_rules();

-- --- Append-only / no-hard-delete guards -------------------------------------
create or replace function public.prevent_update()
returns trigger language plpgsql as $$
begin
  raise exception 'UPDATE_FORBIDDEN: % is append-only for auditability', tg_table_name;
end $$;

create or replace function public.prevent_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'DELETE_FORBIDDEN: % records must not be hard-deleted', tg_table_name;
end $$;

drop trigger if exists trg_movements_no_update on public.stock_movements;
create trigger trg_movements_no_update before update on public.stock_movements
  for each row execute function public.prevent_update();
drop trigger if exists trg_movements_no_delete on public.stock_movements;
create trigger trg_movements_no_delete before delete on public.stock_movements
  for each row execute function public.prevent_delete();

drop trigger if exists trg_audit_no_update on public.audit_log;
create trigger trg_audit_no_update before update on public.audit_log
  for each row execute function public.prevent_update();
drop trigger if exists trg_audit_no_delete on public.audit_log;
create trigger trg_audit_no_delete before delete on public.audit_log
  for each row execute function public.prevent_delete();

-- Attendance may be CORRECTED (update) but never hard-deleted.
drop trigger if exists trg_attendance_no_delete on public.attendance;
create trigger trg_attendance_no_delete before delete on public.attendance
  for each row execute function public.prevent_delete();

-- --- updated_at maintenance ---------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_attendance_updated on public.attendance;
create trigger trg_attendance_updated before update on public.attendance
  for each row execute function public.set_updated_at();
drop trigger if exists trg_emp_private_updated on public.employee_private;
create trigger trg_emp_private_updated before update on public.employee_private
  for each row execute function public.set_updated_at();
drop trigger if exists trg_tg_settings_updated on public.telegram_settings;
create trigger trg_tg_settings_updated before update on public.telegram_settings
  for each row execute function public.set_updated_at();

-- --- Auto-create a profile on signup; first user becomes Owner ---------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  assigned_role app_role;
begin
  assigned_role := case
    when (select count(*) from public.profiles) = 0 then 'owner'::app_role
    else 'viewer'::app_role
  end;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), assigned_role)
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --- Atomic stock transfer (matching out/in pair) ----------------------------
-- SECURITY INVOKER so RLS insert policies apply to the caller. The negative
-- guard trigger still runs on the transfer_out leg.
create or replace function public.post_stock_transfer(
  p_sku uuid,
  p_from uuid,
  p_to uuid,
  p_qty numeric,
  p_business_date date,
  p_notes text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  grp uuid := gen_random_uuid();
begin
  if p_qty <= 0 then raise exception 'Transfer quantity must be greater than zero'; end if;
  if p_from = p_to then raise exception 'Transfer source and destination must differ'; end if;

  insert into public.stock_movements (sku_id, location_id, type, quantity, business_date, transfer_group_id, notes, created_by)
    values (p_sku, p_from, 'transfer_out', -p_qty, p_business_date, grp, p_notes, auth.uid());
  insert into public.stock_movements (sku_id, location_id, type, quantity, business_date, transfer_group_id, notes, created_by)
    values (p_sku, p_to, 'transfer_in', p_qty, p_business_date, grp, p_notes, auth.uid());

  return grp;
end $$;
