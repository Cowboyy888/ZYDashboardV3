-- =============================================================================
-- Zysteel Operations — 0057 Marketing Admin role
--
-- Adds a role scoped to the Marketing domain, same posture as
-- attendance_admin/warehouse_admin/payroll_admin: narrow to its own named
-- area. The only concrete Marketing-adjacent capability in this app today is
-- Team Tasks (0056), so marketing_admin gets tasks:view/tasks:manage —
-- identical access to sales_admin's, since nothing in the schema scopes
-- tasks by department yet (every role that can manage tasks can manage all
-- four departments' tasks, not just their own).
-- =============================================================================

alter type public.app_role add value if not exists 'marketing_admin';
