import { ZysteelLogo } from '@/components/brand/logo';
import { I18nProvider } from '@/components/i18n-provider';
import { LanguageSwitch } from '@/components/language-switch';
import { getLocale } from '@/lib/i18n/locale';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[hsl(208_18%_13%)] to-[hsl(208_20%_9%)] p-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-between">
            <ZysteelLogo invert className="scale-110" />
            <LanguageSwitch />
          </div>
          {children}
          <p className="mt-6 text-center text-xs text-white/50">
            中粤铁网 Zysteel · Operations — Asia/Phnom_Penh
          </p>
        </div>
      </div>
    </I18nProvider>
  );
}
