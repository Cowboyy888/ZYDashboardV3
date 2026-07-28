import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
  className?: string;
}) {
  const toneClass = {
    default: 'text-foreground',
    primary: 'text-primary',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  }[tone];

  return (
    <Card className={className}>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className={cn('mt-1 text-2xl font-bold tabular-nums', toneClass)}>{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}
