-- =============================================================================
-- Zysteel Operations — 0059 Marketing Admin read access to employees/customers
--
-- Found by live-testing the role immediately after adding it (0057/0058):
-- marketing_admin has tasks:manage, but the "New task" form also needs to
-- read employees (required — every task has an employee_id) and customers
-- (optional link) to populate its dropdowns. Neither employees_select nor
-- customers_select included marketing_admin, so those dropdowns rendered
-- empty and the form was unusable despite tasks:manage being granted —
-- same class of RBAC/RLS mismatch as the Telegram incident, caught this
-- time before it reached production. sales_admin already has both (0018,
-- 0014) for the same reason (salesperson/customer pickers) — mirrored here.
-- =============================================================================

drop policy if exists employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated
  using (
    (select public.auth_role()) in
    ('owner', 'system_admin', 'payroll_admin', 'attendance_admin', 'sales_admin', 'marketing_admin', 'viewer')
  );

drop policy if exists customers_select on public.customers;
create policy customers_select on public.customers for select to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin', 'sales_admin', 'marketing_admin'));
