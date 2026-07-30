import { ZysteelLogo } from '@/components/brand/logo';
import { I18nProvider } from '@/components/i18n-provider';
import { LanguageSwitch } from '@/components/language-switch';
import { getLocale } from '@/lib/i18n/locale';

/** One rising welding-spark ember; timing/drift randomized per render. */
function Ember({ seed }: { seed: number }) {
  const rand = (min: number, max: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    const frac = x - Math.floor(x);
    return min + frac * (max - min);
  };
  const left = rand(0, 100);
  const size = rand(2, 5);
  const duration = rand(7, 16);
  const delay = -rand(0, duration); // negative: already mid-flight on load
  const drift = rand(-40, 40);
  const opacity = rand(0.35, 0.85);

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-0 rounded-full bg-primary motion-safe:animate-zy-ember"
      style={
        {
          left: `${left}%`,
          width: size,
          height: size,
          boxShadow: '0 0 6px 2px hsl(var(--primary) / 0.55)',
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          '--ember-drift': `${drift}px`,
          '--ember-opacity': opacity,
        } as React.CSSProperties
      }
    />
  );
}

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale}>
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-[hsl(208_18%_13%)] to-[hsl(208_20%_9%)] p-4">
        {/* Rising welding-spark embers — a nod to ZY Steel's own welded-mesh
            production floor. Purely decorative (aria-hidden) and gated behind
            motion-safe like every other looping animation in the app. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {Array.from({ length: 26 }, (_, i) => (
            <Ember key={i} seed={i + 1} />
          ))}
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
