import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { buttonVariants } from './button-variants';
import { cn } from '@/lib/utils';

/**
 * Prev/Next pager driven entirely by URL search params (?page=N, plus
 * whatever else is in `searchParams`, e.g. ?q=search-term) — a plain
 * server-renderable component (no client JS needed for navigation itself),
 * matching PageHeader's convention of taking already-resolved strings/
 * locale rather than calling useT() internally.
 */
export function Pagination({
  locale,
  page,
  pageSize,
  total,
  basePath,
  searchParams,
  prevLabel,
  nextLabel,
}: {
  locale: 'en' | 'zh';
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  /** Non-page URL search params to preserve across Prev/Next (e.g. { q: 'search term' }). */
  searchParams?: Record<string, string | undefined>;
  /** Pre-translated labels (t('common.previous') / t('common.next')) — same convention as PageHeader. */
  prevLabel: string;
  nextLabel: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function buildHref(targetPage: number): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value) params.set(key, value);
    }
    if (targetPage > 1) params.set('page', String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const summary =
    locale === 'zh'
      ? `第 ${page} / ${totalPages} 页（共 ${total} 条）`
      : `Page ${page} of ${totalPages} (${total} total)`;

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{summary}</span>
      <div className="flex gap-2">
        <Link
          href={buildHref(page - 1)}
          aria-disabled={page <= 1}
          tabIndex={page <= 1 ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            page <= 1 && 'pointer-events-none opacity-50',
          )}
        >
          <ChevronLeft className="h-4 w-4" /> {prevLabel}
        </Link>
        <Link
          href={buildHref(page + 1)}
          aria-disabled={page >= totalPages}
          tabIndex={page >= totalPages ? -1 : undefined}
          className={cn(
            buttonVariants({ variant: 'outline', size: 'sm' }),
            page >= totalPages && 'pointer-events-none opacity-50',
          )}
        >
          {nextLabel} <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
