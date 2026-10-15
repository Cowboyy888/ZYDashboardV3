-- =============================================================================
-- Zysteel Operations — 0058 Marketing Admin task access (RLS)
--
-- Separate migration from 0057 on purpose: a freshly-added enum value
-- (`alter type ... add value`) cannot safely be used in the same
-- transaction/migration that added it — Postgres raises "unsafe use of new
-- value of enum type" if a later statement in the same batch tries to cast
-- the literal 'marketing_admin' to app_role, which every policy below does.
--
-- Widens tasks/daily_metrics RLS to match the tasks:view/tasks:manage grant
-- given to marketing_admin in src/lib/domain/rbac.ts (both must change
-- together — see docs/architecture.md). Same read/write split as
-- sales_admin: marketing_admin is not added to task_departments/
-- task_categories/task_metric_types write policies (those stay
-- owner/system_admin only, matching settings:manage — sales_admin doesn't
-- have that either).
-- =============================================================================

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin', 'sales_admin', 'marketing_admin'));
drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks for all to authenticated
  using ((select public.auth_role()) in ('owner', 'sales_admin', 'marketing_admin'))
  with check ((select public.auth_role()) in ('owner', 'sales_admin', 'marketing_admin'));

drop policy if exists daily_metrics_select on public.daily_metrics;
create policy daily_metrics_select on public.daily_metrics for select to authenticated
  using ((select public.auth_role()) in ('owner', 'system_admin', 'sales_admin', 'marketing_admin'));
drop policy if exists daily_metrics_write on public.daily_metrics;
create policy daily_metrics_write on public.daily_metrics for all to authenticated
  using ((select public.auth_role()) in ('owner', 'sales_admin', 'marketing_admin'))
  with check ((select public.auth_role()) in ('owner', 'sales_admin', 'marketing_admin'));
