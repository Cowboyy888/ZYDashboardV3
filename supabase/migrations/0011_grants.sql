-- =============================================================================
-- Zysteel Operations — 0011 schema privileges
-- Migrations run as the `postgres` role, whose default ACL for the `public`
-- schema does not include SELECT/INSERT/UPDATE for anon/authenticated (only
-- DELETE/TRUNCATE/REFERENCES/TRIGGER), unlike objects created by
-- `supabase_admin`. Without this, every table in this file's migrations is
-- unreadable by signed-in users regardless of RLS policy. Standard Supabase
-- baseline grants; RLS (0003_rls.sql) still governs per-row access.
-- =============================================================================

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
