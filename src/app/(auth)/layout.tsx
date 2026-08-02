import { ZysteelLogo } from '@/components/brand/logo';
import { I18nProvider } from '@/components/i18n-provider';
import { LanguageSwitch } from '@/components/language-switch';
import { getLocale } from '@/lib/i18n/locale';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[hsl(208_18%_13%)] to-[hsl(208_20%_9%)] p-4">
        {/* Woven wire-mesh backdrop — a nod to ZY Steel's own welded-mesh
            product. Two hairline layers, each rotated to a different
            diagonal and drifting at its own speed, cross like warp and weft
            threads. Sized well past the viewport so 45deg rotation never
            reveals a corner gap. Purely decorative and motion-safe-gated
            like every other looping animation in the app. */}
        <div aria-hidden className="pointer-events-none absolute -inset-[80%]">
          <div className="zy-weave-line absolute inset-0 motion-safe:animate-zy-weave-a" />
          <div className="zy-weave-line-accent absolute inset-0 motion-safe:animate-zy-weave-b" />
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
