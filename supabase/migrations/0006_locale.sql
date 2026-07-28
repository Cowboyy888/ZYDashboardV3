-- =============================================================================
-- Zysteel Operations — 0006 UI locale + report language
-- Persist each user's preferred UI language on their profile, and add a
-- future-ready report-language setting (the Telegram attendance report stays
-- Chinese for now regardless of this value).
-- =============================================================================

alter table public.profiles
  add column if not exists locale text check (locale in ('en', 'zh'));

-- Future-ready: language for Telegram reports. Currently only 'zh' is emitted.
alter table public.telegram_settings
  add column if not exists report_language text not null default 'zh'
    check (report_language in ('en', 'zh'));

-- Let a signed-in user set ONLY their own locale, without a broad self-update
-- RLS policy (which would also expose the role column to self-escalation).
create or replace function public.set_my_locale(p_locale text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_locale not in ('en', 'zh') then
    raise exception 'invalid locale: %', p_locale;
  end if;
  update public.profiles set locale = p_locale where id = auth.uid();
end $$;
