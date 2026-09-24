-- =============================================================================
-- Zysteel Operations — 0053 Optimize RLS policy performance
--
-- Every RLS policy in this app (~130 USING/WITH CHECK clauses across every
-- table, built up migration by migration since 0003_rls.sql) calls
-- `public.auth_role()` and/or `auth.uid()` directly, e.g.:
--   using (public.auth_role() in ('owner','system_admin'))
--
-- Called this way, Postgres re-evaluates the function for EVERY ROW the
-- policy is checked against — even though the answer ("what role is the
-- current user") is the same for the whole query. `auth_role()` itself does
-- a `select role from public.profiles where id = auth.uid()` lookup, so a
-- query scanning N rows of, say, stock_movements or attendance runs that
-- profiles lookup N times instead of once. This is Supabase's own documented
-- RLS performance footgun ("Call functions with SELECT" —
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select):
-- wrapping the call as `(select public.auth_role())` lets the planner
-- evaluate it ONCE per query (as an InitPlan) and reuse the cached result
-- for every row, instead of once per row. Same reasoning applies to the bare
-- `auth.uid()` calls (profiles_select, audit_insert, the storage.objects
-- policies).
--
-- Rather than hand-transcribing every policy from its origin migration (many
-- policy names were redefined more than once across migration history, e.g.
-- employees_select in 0003 then again in 0018 — grepping migration files for
-- "the" definition is unreliable; only the LIVE database knows which one
-- actually won), this reads the CURRENT definition of every policy straight
-- from pg_policies, rewrites just the auth_role()/auth.uid() calls, and
-- re-creates each policy with everything else (table, command, roles,
-- permissive/restrictive, the rest of the expression) preserved exactly —
-- so this cannot change WHO can access WHAT, only how cheaply Postgres
-- evaluates the check. Idempotent: skips any policy that's already wrapped
-- (or has no auth_role()/auth.uid() call to begin with, e.g. the `using
-- (true)` policies on locations/product_families/skus/attendance_groups).
-- =============================================================================

do $$
declare
  pol record;
  new_qual text;
  new_check text;
  ddl text;
  n int := 0;
begin
  for pol in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
  loop
    new_qual := pol.qual;
    new_check := pol.with_check;

    -- Negative lookbehind skips a call already wrapped (Postgres deparses a
    -- prior `(select auth_role())` back as `( SELECT auth_role() AS ...)`,
    -- literal "SELECT " right before the call) — makes re-running this
    -- migration a true no-op instead of double-wrapping.
    if new_qual is not null then
      new_qual := regexp_replace(new_qual, '(?<!SELECT )((?:\w+\.)?auth_role\(\))', '(select \1)', 'g');
      new_qual := regexp_replace(new_qual, '(?<!SELECT )(auth\.uid\(\))', '(select \1)', 'g');
    end if;
    if new_check is not null then
      new_check := regexp_replace(new_check, '(?<!SELECT )((?:\w+\.)?auth_role\(\))', '(select \1)', 'g');
      new_check := regexp_replace(new_check, '(?<!SELECT )(auth\.uid\(\))', '(select \1)', 'g');
    end if;

    -- Nothing to do: already optimized, or no auth_role()/auth.uid() call at all.
    continue when new_qual is not distinct from pol.qual
      and new_check is not distinct from pol.with_check;

    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    ddl := format(
      'create policy %I on %I.%I as %s for %s to %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      case when pol.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
      pol.cmd,
      array_to_string(pol.roles, ', ')
    );
    if new_qual is not null then
      ddl := ddl || format(' using (%s)', new_qual);
    end if;
    if new_check is not null then
      ddl := ddl || format(' with check (%s)', new_check);
    end if;

    execute ddl;
    n := n + 1;
  end loop;

  raise notice 'Optimized % RLS polic(y/ies)', n;
end $$;
