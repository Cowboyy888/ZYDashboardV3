-- =============================================================================
-- Zysteel Operations — 0004 private storage buckets + policies
-- Employee photos/documents are PRIVATE and readable only by
-- Owner / System Admin / Payroll Admin. Operational attachments are readable by
-- warehouse/sales staff. Files are always served via short-lived signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('employee-photos', 'employee-photos', false),
  ('employee-docs',   'employee-docs',   false),
  ('attachments',     'attachments',     false)
on conflict (id) do nothing;

-- --- Employee photos + documents (sensitive) ---------------------------------
drop policy if exists emp_private_read on storage.objects;
create policy emp_private_read on storage.objects for select to authenticated
  using (
    bucket_id in ('employee-photos','employee-docs')
    and public.auth_role() in ('owner','system_admin','payroll_admin')
  );

drop policy if exists emp_private_write on storage.objects;
create policy emp_private_write on storage.objects for insert to authenticated
  with check (
    bucket_id in ('employee-photos','employee-docs')
    and public.auth_role() in ('owner','system_admin')
  );

drop policy if exists emp_private_update on storage.objects;
create policy emp_private_update on storage.objects for update to authenticated
  using (
    bucket_id in ('employee-photos','employee-docs')
    and public.auth_role() in ('owner','system_admin')
  );

-- --- Operational attachments (receipts, delivery notes, etc.) -----------------
drop policy if exists attachments_read on storage.objects;
create policy attachments_read on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and public.auth_role() in ('owner','system_admin','warehouse_admin','sales_admin','viewer')
  );

drop policy if exists attachments_write on storage.objects;
create policy attachments_write on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.auth_role() in ('owner','system_admin','warehouse_admin','sales_admin')
  );
