'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { setLocale } from '@/lib/actions/locale';
import { useLocale } from '@/components/i18n-provider';
import type { Locale } from '@/lib/i18n';

/**
 * Compact `EN | 中文` segmented control matching the red/charcoal brand.
 * Persists the choice (cookie + profile) then refreshes so every server-rendered
 * label re-renders in the new language immediately.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const active = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(next: Locale) {
    if (next === active || pending) return;
    // Optimistic cookie write so the refresh already reflects the choice even
    // before the server action resolves.
    document.cookie = `zy_locale=${next}; path=/; max-age=31536000; samesite=lax`;
    start(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  const options: { value: Locale; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'zh', label: '中文' },
  ];

  return (
    <div
      role="group"
      aria-label="Language / 语言"
      className={cn(
        'inline-flex items-center rounded-md border border-input bg-muted p-0.5 text-sm',
        pending && 'opacity-70',
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={active === opt.value}
          onClick={() => choose(opt.value)}
          className={cn(
            'min-w-[2.5rem] rounded-[5px] px-2.5 py-1 font-medium transition-colors',
            active === opt.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
