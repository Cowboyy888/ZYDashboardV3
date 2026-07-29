import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  className,
  style,
  href,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  className?: string;
  style?: React.CSSProperties;
  /** When set, the whole card becomes a link with a hover-lift affordance. */
  href?: string;
  /** Small icon rendered top-right in a tone-tinted chip. */
  icon?: React.ReactNode;
}) {
  const toneClass = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  }[tone];
  const chipClass = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone];

  const card = (
    <Card
      className={cn(
        href &&
          'h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
        !href && className,
      )}
      style={!href ? style : undefined}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          {icon && (
            <div className={cn('shrink-0 rounded-md p-1.5', chipClass)}>
              <div className="h-4 w-4">{icon}</div>
            </div>
          )}
        </div>
        <div className={cn('mt-1 text-2xl font-bold tabular-nums', toneClass)}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className={cn('block', className)} style={style}>
        {card}
      </Link>
    );
  }
  return card;
}
