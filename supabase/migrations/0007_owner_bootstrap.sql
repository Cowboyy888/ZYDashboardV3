-- =============================================================================
-- Zysteel Operations — 0007 safe Owner bootstrap
-- First-Owner setup is allowed ONLY while no Owner exists; afterwards it is
-- permanently disabled and new users can be added only by an existing Owner
-- (an approved admin action via the service-role API). Public self-signup is
-- turned off in supabase/config.toml (enable_signup = false).
-- =============================================================================

-- Anonymous-callable check used by the setup page + bootstrap action.
create or replace function public.owner_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where role = 'owner');
$$;

grant execute on function public.owner_exists() to anon, authenticated;
