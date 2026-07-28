import 'server-only';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, type Locale } from './index';

export const LOCALE_COOKIE = 'zy_locale';

/** The locale explicitly chosen via cookie, or null if unset. */
export async function getCookieLocale(): Promise<Locale | null> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : null;
}

/** Active UI locale from the cookie, defaulting to English. */
export async function getLocale(): Promise<Locale> {
  return (await getCookieLocale()) ?? DEFAULT_LOCALE;
}

/**
 * Resolve the locale for a request: an explicit cookie choice wins; otherwise
 * fall back to the signed-in user's saved preference, then the default.
 */
export function resolveLocale(cookieLocale: Locale | null, profileLocale?: string | null): Locale {
  if (cookieLocale) return cookieLocale;
  if (isLocale(profileLocale)) return profileLocale;
  return DEFAULT_LOCALE;
}
