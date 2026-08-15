-- =============================================================================
-- Zysteel Operations — 0032 login events
-- Append-only record of successful sign-ins (who, when, IP, geo) for the
-- Settings > Login History page. Distinct from audit_log, which records
-- business actions, not authentication events.
-- =============================================================================

create table if not exists public.login_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  email       text,
  ip_address  text,
  country     text,
  city        text,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists login_events_user_idx on public.login_events (user_id);
create index if not exists login_events_created_idx on public.login_events (created_at desc);

alter table public.login_events enable row level security;

drop policy if exists login_events_select on public.login_events;
create policy login_events_select on public.login_events for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin'));

drop policy if exists login_events_insert on public.login_events;
create policy login_events_insert on public.login_events for insert to authenticated
  with check (user_id = auth.uid());
-- No UPDATE/DELETE policies: append-only, same posture as audit_log.
