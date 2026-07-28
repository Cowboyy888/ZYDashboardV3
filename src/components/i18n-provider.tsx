'use client';
import { createContext, useContext } from 'react';
import {
  translator,
  localizeMessage,
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from '@/lib/i18n';

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

/** Provides the active UI locale to all client components below it. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** `const { t, locale, m } = useT()` — t for keys, m to localise action messages. */
export function useT() {
  const locale = useContext(LocaleContext);
  return {
    locale,
    t: (key: MessageKey) => translator(locale)(key),
    m: (text: string | undefined | null) => (text ? localizeMessage(locale, text) : (text ?? '')),
  };
}
