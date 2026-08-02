import { ZysteelLogo } from '@/components/brand/logo';
import { I18nProvider } from '@/components/i18n-provider';
import { LanguageSwitch } from '@/components/language-switch';
import { getLocale } from '@/lib/i18n/locale';

/** One spark shooting up off the furnace glow; timing/drift/color randomized per render. */
function Spark({ seed }: { seed: number }) {
  const rand = (min: number, max: number) => {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    const frac = x - Math.floor(x);
    return min + frac * (max - min);
  };
  const left = rand(0, 100);
  const size = rand(1.5, 3.5);
  const duration = rand(3, 7);
  const delay = -rand(0, duration); // negative: already mid-flight on load
  const drift = rand(-70, 70);
  const opacity = rand(0.5, 1);
  const hue = rand(28, 48); // molten orange -> yellow

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-0 rounded-full motion-safe:animate-zy-spark-rise"
      style={
        {
          left: `${left}%`,
          width: size,
          height: size,
          backgroundColor: `hsl(${hue} 100% 65%)`,
          boxShadow: `0 0 ${size * 2}px ${size * 0.8}px hsl(${hue} 100% 55% / 0.65)`,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          '--spark-drift': `${drift}px`,
          '--spark-opacity': opacity,
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
        {/* Steel-mill furnace backdrop — a warm glow along the bottom edge
            that breathes like an open furnace, with sparks shooting up out
            of it. A direct nod to ZY Steel's own production floor. Purely
            decorative and motion-safe-gated like every other looping
            animation in the app. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-x-0 bottom-[-25%] h-[65%] motion-safe:animate-zy-furnace-glow"
            style={{
              background:
                'radial-gradient(ellipse at center, hsl(22 95% 48% / 0.55) 0%, hsl(14 85% 35% / 0.28) 40%, transparent 72%)',
            }}
          />
          {Array.from({ length: 28 }, (_, i) => (
            <Spark key={i} seed={i + 1} />
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
