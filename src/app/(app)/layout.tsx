import { requireUser } from '@/lib/auth';
import { getCookieLocale, resolveLocale } from '@/lib/i18n/locale';
import { AppShell } from '@/components/app-shell';
import { I18nProvider } from '@/components/i18n-provider';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const cookieLocale = await getCookieLocale();
  const locale = resolveLocale(cookieLocale, user.locale);
  return (
    <I18nProvider locale={locale}>
      <AppShell
        user={{ email: user.email, fullName: user.fullName, role: user.role }}
        locale={locale}
      >
        {children}
      </AppShell>
    </I18nProvider>
  );
}
