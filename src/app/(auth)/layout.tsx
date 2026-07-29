import { ZysteelLogo } from '@/components/brand/logo';
import { I18nProvider } from '@/components/i18n-provider';
import { LanguageSwitch } from '@/components/language-switch';
import { getLocale } from '@/lib/i18n/locale';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[hsl(208_18%_13%)] to-[hsl(208_20%_9%)] p-4">
        {/* Ambient background glow — purely decorative, so it's hidden from
            assistive tech and gated behind motion-safe like every other
            looping animation in the app. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/25 blur-3xl motion-safe:animate-zy-glow"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-16 h-80 w-80 rounded-full bg-primary/15 blur-3xl motion-safe:animate-zy-glow"
          style={{ animationDelay: '-6s' }}
        />
        <div className="relative w-full max-w-md">
          <div className="mb-6 flex items-center justify-between motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:fill-mode-both">
            <ZysteelLogo invert className="scale-110" />
            <LanguageSwitch />
          </div>
          <div
            className="motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-3 motion-safe:fill-mode-both"
            style={{ animationDelay: '100ms' }}
          >
            {children}
          </div>
          <p
            className="mt-6 text-center text-xs text-white/50 motion-safe:duration-700 motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-both"
            style={{ animationDelay: '350ms' }}
          >
            中粤铁网 Zysteel · Operations — Asia/Phnom_Penh
          </p>
        </div>
      </div>
    </I18nProvider>
  );
}
