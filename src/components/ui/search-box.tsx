'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Input } from './input';

/**
 * Debounced search box that drives a server-rendered, paginated list via the
 * URL's `q` param (and resets `page` back to 1 on every new search) — for
 * list pages backed by a *Page() query (e.g. getSalesOrdersPage), where
 * filtering has to happen server-side since only one page of rows is ever
 * sent to the client. Unrelated to the plain useState+useMemo search boxes
 * on pages that still fetch their full, unpaginated dataset.
 */
export function SearchBox({ placeholder, className }: { placeholder: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('q')]);

  function onChange(next: string) {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) params.set('q', next.trim());
      else params.delete('q');
      params.delete('page');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }, 350);
  }

  return (
    <div className={`relative w-full sm:w-80 ${className ?? ''}`}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 pl-8"
      />
    </div>
  );
}
