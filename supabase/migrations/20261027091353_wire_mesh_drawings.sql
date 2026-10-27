-- Wire Mesh Order Drawings are editable commercial specifications linked to
-- exactly one existing quotation or sales order. Dimensions are outside sheet
-- dimensions; edge overhangs are measured to the outer wire centreline.
create table if not exists public.wire_mesh_drawings (
  id                    uuid primary key default gen_random_uuid(),
  quotation_id          uuid references public.quotations(id) on delete restrict,
  sales_order_id        uuid references public.sales_orders(id) on delete restrict,
  customer_name         text not null,
  mesh_specification    text not null,
  wire_diameter_mm      numeric(10, 3) not null check (wire_diameter_mm > 0),
  sheet_length_mm       numeric(12, 3) not null check (sheet_length_mm > 0),
  sheet_width_mm        numeric(12, 3) not null check (sheet_width_mm > 0),
  length_spacing_mm     numeric(12, 3) not null check (length_spacing_mm > 0),
  width_spacing_mm      numeric(12, 3) not null check (width_spacing_mm > 0),
  overhang_left_mm      numeric(12, 3) not null default 0 check (overhang_left_mm >= 0),
  overhang_right_mm     numeric(12, 3) not null default 0 check (overhang_right_mm >= 0),
  overhang_top_mm       numeric(12, 3) not null default 0 check (overhang_top_mm >= 0),
  overhang_bottom_mm    numeric(12, 3) not null default 0 check (overhang_bottom_mm >= 0),
  quantity              integer not null check (quantity > 0),
  created_by            uuid references public.profiles(id) on delete set null,
  updated_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint wire_mesh_drawings_one_reference check (
    num_nonnulls(quotation_id, sales_order_id) = 1
  ),
  constraint wire_mesh_drawings_length_overhangs_fit check (
    sheet_length_mm > overhang_left_mm + overhang_right_mm
  ),
  constraint wire_mesh_drawings_width_overhangs_fit check (
    sheet_width_mm > overhang_top_mm + overhang_bottom_mm
  )
);

create index if not exists wire_mesh_drawings_quotation_idx on public.wire_mesh_drawings (quotation_id);
create index if not exists wire_mesh_drawings_sales_order_idx on public.wire_mesh_drawings (sales_order_id);

drop trigger if exists trg_wire_mesh_drawings_updated on public.wire_mesh_drawings;
create trigger trg_wire_mesh_drawings_updated before update on public.wire_mesh_drawings
  for each row execute function public.set_updated_at();

alter table public.wire_mesh_drawings enable row level security;

create policy wire_mesh_drawings_select on public.wire_mesh_drawings for select to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin', 'sales_admin'));
create policy wire_mesh_drawings_write on public.wire_mesh_drawings for all to authenticated
  using ((select public.auth_role()) in ('owner', 'sales_admin'))
  with check ((select public.auth_role()) in ('owner', 'sales_admin'));
