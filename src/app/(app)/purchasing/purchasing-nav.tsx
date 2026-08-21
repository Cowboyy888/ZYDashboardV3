'use client';
import Link from 'next/link';
import { useT } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';

/** Small sub-nav shared across the Purchasing section's pages. */
export function PurchasingNav({ active }: { active: 'dashboard' | 'orders' | 'suppliers' }) {
  const { t } = useT();
  const items = [
    { key: 'dashboard' as const, href: '/purchasing', label: t('pur.dashboard') },
    { key: 'orders' as const, href: '/purchasing/orders', label: t('pur.orders') },
    { key: 'suppliers' as const, href: '/purchasing/suppliers', label: t('pur.suppliers') },
  ];
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            'shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            active === item.key
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
