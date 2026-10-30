-- P4.1 planning documents only. No stock writes, raw-material deductions or output posting.
begin;
create schema if not exists production_private;
revoke all on schema production_private from public, anon;
grant usage on schema production_private to authenticated;
create sequence public.production_order_number_seq;
revoke all on sequence public.production_order_number_seq from public, anon, authenticated;

create table if not exists public.production_orders (
  id uuid primary key,
  order_number text not null unique,
  business_date date not null,
  sales_order_item_id uuid references public.sales_order_items(id) on delete restrict,
  sales_order_id uuid references public.sales_orders(id) on delete restrict,
  sales_order_number text,
  customer_reference text,
  internal_reason text,
  sku_id uuid not null references public.skus(id) on delete restrict,
  sku_label text not null,
  drawing_id uuid not null references public.wire_mesh_drawings(id) on delete restrict,
  geometry jsonb not null,
  planned_quantity integer not null check (planned_quantity between 1 and 1000000),
  required_date date not null,
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  planned_line text,
  supervisor_id uuid references public.employees(id) on delete restrict,
  supervisor_name text,
  notes text,
  attachment_path text,
  status text not null default 'draft' check (status in ('draft','approved','on_hold','cancelled')),
  held_from_status text check (held_from_status in ('draft','approved')),
  status_reason text,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  version integer not null default 1,
  creation_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_orders_origin check (
    (sales_order_item_id is not null and internal_reason is null) or
    (sales_order_item_id is null and coalesce(length(btrim(internal_reason)),0) > 0)
  ),
  constraint production_orders_date check (required_date >= business_date)
);
-- One active plan per commercial line. Partial manufacturing runs belong to
-- that plan in a later phase, rather than competing duplicate production orders.
create unique index production_orders_one_active_sales_item on public.production_orders(sales_order_item_id)
  where sales_order_item_id is not null and status <> 'cancelled';
create index production_orders_due_idx on public.production_orders(status, required_date);
create index production_orders_created_idx on public.production_orders(created_at desc);
-- Cover referential checks against both current plans and cancelled history.
create index production_orders_sales_item_idx on public.production_orders(sales_order_item_id);
create index production_orders_sales_order_idx on public.production_orders(sales_order_id);
create index production_orders_sku_idx on public.production_orders(sku_id);
create index production_orders_drawing_idx on public.production_orders(drawing_id);
create index production_orders_supervisor_idx on public.production_orders(supervisor_id);
create index production_orders_created_by_idx on public.production_orders(created_by);
create index production_orders_updated_by_idx on public.production_orders(updated_by);
create index production_orders_approved_by_idx on public.production_orders(approved_by);
alter table public.production_orders enable row level security;

-- Mirrors production:* in rbac.ts. No source-table or employee-private policy is widened.
create policy production_orders_select on public.production_orders for select to authenticated
  using ((select public.auth_role()) in ('owner','system_admin','warehouse_admin','sales_admin')
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_active));
create policy production_orders_insert on public.production_orders for insert to authenticated
  with check ((select public.auth_role()) in ('owner','warehouse_admin'));
create policy production_orders_update on public.production_orders for update to authenticated
  using ((select public.auth_role()) in ('owner','warehouse_admin'))
  with check ((select public.auth_role()) in ('owner','warehouse_admin'));
revoke all on public.production_orders from public, anon, authenticated;
grant select, insert, update on public.production_orders to authenticated;
grant all on public.production_orders to service_role;

create function production_private.guard_production_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor public.profiles;
  d public.wire_mesh_drawings;
  source record;
  supervisor public.employees;
  item_label text;
  remaining numeric;
  length_intervals numeric;
  width_intervals numeric;
  sequence_value text;
begin
  select * into actor from public.profiles where id = auth.uid() and is_active;
  if actor.id is null or actor.role not in ('owner','warehouse_admin') then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.order_number <> old.order_number
      or new.business_date <> old.business_date or new.created_by <> old.created_by
      or new.created_at <> old.created_at or new.creation_payload is distinct from old.creation_payload
      or new.version <> old.version or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
      or new.held_from_status is distinct from old.held_from_status then
      raise exception 'PRODUCTION_LOCKED';
    end if;
    if new.status <> old.status then
      if (to_jsonb(new) - array['status','status_reason']) is distinct from
        (to_jsonb(old) - array['status','status_reason']) then raise exception 'PRODUCTION_LOCKED'; end if;
      if not (
        (old.status = 'draft' and new.status in ('approved','on_hold','cancelled')) or
        (old.status = 'approved' and new.status in ('on_hold','cancelled')) or
        (old.status = 'on_hold' and new.status in (old.held_from_status,'cancelled'))
      ) then raise exception 'PRODUCTION_TRANSITION'; end if;
      if new.status in ('on_hold','cancelled') and coalesce(length(btrim(new.status_reason)),0) = 0 then
        raise exception 'PRODUCTION_REASON_REQUIRED';
      end if;
      if new.status = 'on_hold' then new.held_from_status := old.status;
      elsif old.status = 'on_hold' then new.held_from_status := null;
      end if;
    elsif old.status <> 'draft' then raise exception 'PRODUCTION_LOCKED';
    end if;
    new.version := old.version + 1;
  else
    if new.status <> 'draft' then raise exception 'PRODUCTION_TRANSITION'; end if;
    sequence_value := nextval('public.production_order_number_seq')::text;
    new.order_number := 'PRD-' || extract(year from new.business_date)::text || '-' ||
      lpad(sequence_value, greatest(8,length(sequence_value)), '0');
    new.created_by := actor.id; new.created_at := now(); new.version := 1;
    new.approved_by := null; new.approved_at := null; new.held_from_status := null;
  end if;
  if new.status = 'approved' then
    if actor.role <> 'owner' then raise exception 'PRODUCTION_APPROVE_OWNER_ONLY'; end if;
    if not exists(select 1 from public.skus s join public.product_families f on f.id=s.family_id
      where s.id=new.sku_id and s.is_active and f.is_active and s.unit='张') then
      raise exception 'PRODUCTION_SKU_INVALID';
    end if;
    if new.supervisor_id is not null and not exists(select 1 from public.employees where id=new.supervisor_id and is_active) then
      raise exception 'PRODUCTION_SUPERVISOR_INVALID';
    end if;
    if new.approved_at is null then new.approved_at := now(); new.approved_by := actor.id; end if;
  end if;

  -- Recheck source eligibility when saving a draft or approving. Hold/cancel
  -- remains possible even if a commercial order was subsequently cancelled.
  if new.status in ('draft','approved') then
    if new.sales_order_item_id is not null then
      select so.id as so_id, so.so_number, so.status, so.quotation_id,
        soi.sku_id, soi.ordered_qty, soi.unit, c.name as customer_name
        into source from public.sales_order_items soi
        join public.sales_orders so on so.id = soi.sales_order_id
        join public.customers c on c.id = so.customer_id
        where soi.id = new.sales_order_item_id for update of soi, so;
      if not found or source.status not in ('confirmed','partially_delivered') or source.sku_id <> new.sku_id or source.unit <> '张' then
        raise exception 'PRODUCTION_SOURCE_INVALID';
      end if;
      select source.ordered_qty - coalesce(sum(-m.quantity),0) into remaining
        from public.stock_movements m where m.sales_order_item_id = new.sales_order_item_id and m.type = 'sale_delivery';
      if new.planned_quantity > remaining then raise exception 'PRODUCTION_EXCEEDS_OUTSTANDING'; end if;
      if tg_op = 'INSERT' or old.approved_at is null then
        new.sales_order_id := source.so_id; new.sales_order_number := source.so_number;
        new.customer_reference := source.customer_name;
      end if;
    else
      new.sales_order_id := null; new.sales_order_number := null; new.customer_reference := null;
    end if;
  end if;

  if tg_op = 'INSERT' or (new.status = 'draft' and old.status = 'draft') then
    select concat_ws(' · ', f.name, s.diameter, s.size, s.hole, s.condition) into item_label
      from public.skus s join public.product_families f on f.id = s.family_id
      where s.id = new.sku_id and s.is_active and f.is_active and s.unit = '张';
    if item_label is null then raise exception 'PRODUCTION_SKU_INVALID'; end if;
    new.sku_label := item_label;
    select * into d from public.wire_mesh_drawings where id = new.drawing_id;
    if d.id is null then raise exception 'PRODUCTION_DRAWING_INVALID'; end if;
    if new.sales_order_item_id is not null then
      if not (d.sales_order_id is not distinct from source.so_id or
        (source.quotation_id is not null and d.quotation_id is not distinct from source.quotation_id)) then
        raise exception 'PRODUCTION_DRAWING_INVALID';
      end if;
    end if;
    length_intervals := (d.sheet_length_mm - d.overhang_left_mm - d.overhang_right_mm) / d.length_spacing_mm;
    width_intervals := (d.sheet_width_mm - d.overhang_top_mm - d.overhang_bottom_mm) / d.width_spacing_mm;
    if abs(length_intervals - round(length_intervals)) > 0.00000001 or
      abs(width_intervals - round(width_intervals)) > 0.00000001 then raise exception 'PRODUCTION_GEOMETRY_INVALID'; end if;
    new.geometry := jsonb_build_object(
      'wireDiameterMm', d.wire_diameter_mm, 'meshSpecification', d.mesh_specification,
      'sheetLengthMm',d.sheet_length_mm,'sheetWidthMm',d.sheet_width_mm,
      'lengthSpacingMm',d.length_spacing_mm,'widthSpacingMm',d.width_spacing_mm,
      'overhangLeftMm',d.overhang_left_mm,'overhangRightMm',d.overhang_right_mm,
      'overhangTopMm',d.overhang_top_mm,'overhangBottomMm',d.overhang_bottom_mm);
    new.supervisor_name := null;
    if new.supervisor_id is not null then
      select * into supervisor from public.employees where id = new.supervisor_id and is_active;
      if supervisor.id is null then raise exception 'PRODUCTION_SUPERVISOR_INVALID'; end if;
      new.supervisor_name := coalesce(supervisor.display_name, supervisor.name_english, supervisor.name_chinese, supervisor.name_khmer);
    end if;
  end if;
  new.updated_by := actor.id; new.updated_at := now();
  return new;
end $$;
revoke all on function production_private.guard_production_order() from public, anon, authenticated;
create trigger trg_production_order_guard before insert or update on public.production_orders
  for each row execute function production_private.guard_production_order();
create trigger trg_production_order_no_delete before delete on public.production_orders
  for each row execute function public.prevent_delete();

create function production_private.audit_production_order() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log(actor_id,actor_email,action,entity,entity_id,old_value,new_value)
  select auth.uid(), p.email,
    case when tg_op = 'INSERT' then 'production_order.create'
      when old.status <> new.status then 'production_order.' || new.status else 'production_order.update' end,
    'production_orders',new.id::text,
    case when tg_op = 'UPDATE' then to_jsonb(old) - 'creation_payload' else null end,
    to_jsonb(new) - 'creation_payload'
  from public.profiles p where p.id = auth.uid();
  return new;
end $$;
revoke all on function production_private.audit_production_order() from public, anon, authenticated;
create trigger trg_production_order_audit after insert or update on public.production_orders
  for each row execute function production_private.audit_production_order();

-- Idempotent create: retrying one browser form never creates another plan.
create function public.create_production_order(p_id uuid, p_input jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare existing public.production_orders;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('owner','warehouse_admin')) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into existing from public.production_orders where id = p_id;
  if found then
    if existing.created_by <> auth.uid() or existing.creation_payload is distinct from p_input then
      raise exception 'PRODUCTION_REQUEST_CONFLICT';
    end if;
    return existing.id;
  end if;
  insert into public.production_orders(id,business_date,sales_order_item_id,internal_reason,sku_id,drawing_id,
    planned_quantity,required_date,priority,planned_line,supervisor_id,notes,attachment_path,creation_payload)
  values(p_id,(p_input->>'business_date')::date,(p_input->>'sales_order_item_id')::uuid,p_input->>'internal_reason',
    (p_input->>'sku_id')::uuid,(p_input->>'drawing_id')::uuid,(p_input->>'planned_quantity')::integer,
    (p_input->>'required_date')::date,p_input->>'priority',p_input->>'planned_line',
    (p_input->>'supervisor_id')::uuid,p_input->>'notes',p_input->>'attachment_path',p_input);
  return p_id;
end $$;
revoke all on function public.create_production_order(uuid,jsonb) from public, anon;
grant execute on function public.create_production_order(uuid,jsonb) to authenticated;

-- Narrow planning lookups intentionally expose no commercial prices, customer
-- contact details, employee pay or photos. They do not widen source-table RLS.
create function production_private.reference_options(p_kind text, p_search text default '', p_selected uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not exists(select 1 from public.profiles where id = auth.uid() and is_active and role in ('owner','warehouse_admin')) then
    raise exception 'PRODUCTION_FORBIDDEN';
  end if;
  if length(p_search) > 80 then raise exception 'PRODUCTION_REFERENCE_INVALID'; end if;
  if p_kind = 'sales_items' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
      select i.id, o.so_number || ' · ' || concat_ws(' / ',s.diameter,s.size,s.hole) as label,
        i.sku_id, concat_ws(' / ',s.diameter,s.size,s.hole) as sku_label
      from public.sales_order_items i join public.sales_orders o on o.id=i.sales_order_id
      join public.skus s on s.id=i.sku_id
      where o.status in ('confirmed','partially_delivered') and s.unit='张' and i.unit='张'
        and (o.so_number ilike '%' || p_search || '%' or i.id=p_selected)
      order by (i.id=p_selected) desc nulls last, o.created_at desc, i.id limit 30
    ) x;
  elsif p_kind = 'skus' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
      select s.id,concat_ws(' · ',f.name,s.diameter,s.size,s.hole,s.condition) as label
      from public.skus s join public.product_families f on f.id=s.family_id
      where s.is_active and f.is_active and s.unit='张'
        and (concat_ws(' ',f.name,s.diameter,s.size,s.hole) ilike '%' || p_search || '%' or s.id=p_selected)
      order by (s.id=p_selected) desc nulls last, s.created_at desc, s.id limit 30
    ) x;
  elsif p_kind = 'drawings' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
      select d.id, d.mesh_specification || ' · ' || d.sheet_length_mm || '×' || d.sheet_width_mm || ' mm · ' || d.wire_diameter_mm || ' mm' as label
      from public.wire_mesh_drawings d
      where d.mesh_specification ilike '%' || p_search || '%' or d.id=p_selected
      order by (d.id=p_selected) desc nulls last,d.created_at desc,d.id limit 30
    ) x;
  elsif p_kind = 'supervisors' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
      select e.id,coalesce(e.display_name,e.name_english,e.name_chinese,e.name_khmer,e.employee_code) as label
      from public.employees e where e.is_active and
        (concat_ws(' ',e.display_name,e.name_english,e.name_chinese,e.name_khmer) ilike '%' || p_search || '%' or e.id=p_selected)
      order by (e.id=p_selected) desc nulls last,e.employee_code limit 30
    ) x;
  else raise exception 'PRODUCTION_REFERENCE_INVALID'; end if;
  return result;
end $$;
revoke all on function production_private.reference_options(text,text,uuid) from public, anon;
grant execute on function production_private.reference_options(text,text,uuid) to authenticated;
create function public.production_reference_options(p_kind text, p_search text default '', p_selected uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select production_private.reference_options(p_kind,p_search,p_selected)
$$;
revoke all on function public.production_reference_options(text,text,uuid) from public, anon;
grant execute on function public.production_reference_options(text,text,uuid) to authenticated;
commit;
