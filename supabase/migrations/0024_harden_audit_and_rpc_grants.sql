-- =============================================================================
-- Zysteel Operations — 0024 Harden audit_log insert policy + RPC grants
--
-- Three related gaps found in a security review, none caught by
-- `npm run verify` (see the accompanying fix to scripts/validate-schema.mjs
-- for why — its RLS-coverage check was silently stuck on a hardcoded,
-- stale table list):
--
-- 1. audit_log's insert policy (0003_rls.sql) only checked
--    `auth.uid() is not null` — any authenticated user, including a Viewer,
--    could insert an audit_log row with an arbitrary actor_id/actor_email,
--    forging an entry attributed to someone else (e.g. blaming the Owner for
--    an action they never took). audit_log is otherwise correctly immutable
--    (no update policy, trg_audit_no_update blocks deletes), but that
--    protection is worthless if the initial row can be forged. The app
--    (src/lib/audit.ts) always writes actor_id as the caller's own
--    auth.uid(), so pinning the check to that is a pure tightening with no
--    legitimate-write impact.
--
-- 2. product_family_usage(uuid) (0009_product_family_fields.sql) is
--    `security definer` — it runs with the function owner's privileges and
--    so bypasses RLS on stock_movements/purchase_order_items/
--    sales_order_items entirely. Its own `grant execute ... to authenticated`
--    looked like the only grant, but 0011_grants.sql's blanket
--    `grant all on all routines in schema public to anon, authenticated,
--    service_role` (run after this function was created) gave `anon` an
--    explicit, separate EXECUTE grant too — and its matching
--    `alter default privileges ... grant all on routines to anon` means
--    every *future* function gets the same anon grant unless a later
--    migration revokes it, exactly like this one had to. Net effect: the
--    public, unauthenticated Supabase anon key could call this RPC directly
--    via PostgREST and read aggregate sales/purchase/movement counts per
--    product family, despite those tables' own RLS restricting that data to
--    owner/system_admin/warehouse_admin/sales_admin. `auth_role()`,
--    `owner_exists()` and `set_my_locale()` were audited too — all three
--    scope themselves to `auth.uid()` internally and are safe (or, for
--    owner_exists(), required) to stay anon-callable.
--
-- 3. That same 0011 default-privileges statement means every function
--    created from now on is anon-callable the moment it's created, silently,
--    unless its own migration remembers to revoke it — the exact mistake #2
--    just fixed. Close the footgun at the source: future routines no longer
--    default to anon-executable. owner_exists() already has its own explicit
--    `grant ... to anon` (0007), so it is unaffected and stays callable
--    pre-auth by the setup page.
-- =============================================================================

drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid());

revoke execute on function public.product_family_usage(uuid) from public, anon;
grant execute on function public.product_family_usage(uuid) to authenticated;

alter default privileges in schema public revoke execute on routines from anon;
