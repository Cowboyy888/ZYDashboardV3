import { ZysteelLogo } from '@/components/brand/logo';
import { I18nProvider } from '@/components/i18n-provider';
import { LanguageSwitch } from '@/components/language-switch';
import { getLocale } from '@/lib/i18n/locale';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[hsl(208_18%_13%)] to-[hsl(208_20%_9%)] p-4">
        {/* Flowing gradient wave — three large, softly blurred blobs (two
            brand red, one cool steel-blue for contrast) drifting along slow,
            independent loops, so their overlap keeps shifting into a calm
            ambient wave of color rather than a busy pattern. Purely
            decorative and motion-safe-gated like every other looping
            animation in the app. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-[-10%] top-[-15%] h-[600px] w-[600px] rounded-full bg-primary/25 blur-[120px] motion-safe:animate-zy-wave-1" />
          <div className="absolute left-[55%] top-[10%] h-[550px] w-[550px] rounded-full bg-[hsl(200_75%_50%/0.4)] blur-[100px] motion-safe:animate-zy-wave-2" />
          <div className="absolute bottom-[-20%] left-[30%] h-[500px] w-[500px] rounded-full bg-primary/15 blur-[120px] motion-safe:animate-zy-wave-3" />
        </div>
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
            中粤铁网 Zysteel · Operations — Asia/Bangkok
          </p>
        </div>
      </div>
    </I18nProvider>
  );
}
