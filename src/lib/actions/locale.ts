'use server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LOCALE_COOKIE } from '@/lib/i18n/locale';
import { isLocale } from '@/lib/i18n';

/**
 * Persist the chosen UI locale. Always sets the cookie (the local/demo store);
 * additionally saves to the signed-in user's profile via a locale-only RPC.
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.rpc('set_my_locale', { p_locale: locale });
  } catch {
    // Local/demo mode (no Supabase): the cookie is sufficient.
  }
}
