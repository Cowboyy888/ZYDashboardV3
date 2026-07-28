import { cn } from '@/lib/utils';

/**
 * Zysteel (中粤铁网) brand mark — the supplied company logo
 * (public/brand/zysteel-logo.png, red mark on transparent). Rendered at a fixed
 * height with width:auto so its proportions are always preserved. Used in the
 * sidebar, dashboard/mobile header, and login.
 */
export function ZysteelLogo({
  className,
  showWordmark = true,
  invert = false,
  size = 36,
}: {
  className?: string;
  showWordmark?: boolean;
  invert?: boolean;
  size?: number;
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/zysteel-logo.png"
        alt="中粤铁网 Zysteel"
        height={size}
        style={{ height: size, width: 'auto' }}
        className="shrink-0 object-contain"
      />
      {showWordmark && (
        <div className="leading-tight">
          <div
            className={cn(
              'text-sm font-bold tracking-tight',
              invert ? 'text-white' : 'text-foreground',
            )}
          >
            中粤铁网
          </div>
          <div
            className={cn(
              'text-[10px] font-semibold uppercase tracking-[0.2em]',
              invert ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            Zysteel
          </div>
        </div>
      )}
    </div>
  );
}
