-- =============================================================================
-- Zysteel Operations — 0051 Sales Admin can add (not edit) new product specs
--
-- The Price Records form gained an inline "+ New spec" option so whoever
-- manages prices (normally Sales Admin) doesn't have to detour through
-- Settings > Products > Add Specification to log a price for a brand-new
-- item. That requires an INSERT-only grant on skus for sales_admin — editing,
-- archiving, and deleting specs stays owner/system_admin only via the
-- existing skus_write ("for all") policy from 0003_rls.sql, unchanged.
--
-- Two permissive policies on the same command are OR'd by Postgres, so this
-- adds to (never narrows) what skus_write already allows.
-- =============================================================================

drop policy if exists skus_insert on public.skus;
create policy skus_insert on public.skus for insert to authenticated
  with check (public.auth_role() in ('owner', 'system_admin', 'sales_admin'));
