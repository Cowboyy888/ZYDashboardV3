'use client';
import Link from 'next/link';
import { useT } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';

/** Small sub-nav shared across the Sales section's pages. */
export function SalesNav({
  active,
}: {
  active: 'dashboard' | 'orders' | 'inquiries' | 'customers';
}) {
  const { t } = useT();
  const items = [
    { key: 'dashboard' as const, href: '/sales', label: t('sal.dashboard') },
    { key: 'inquiries' as const, href: '/sales/inquiries', label: t('sal.inquiries') },
    { key: 'orders' as const, href: '/sales/orders', label: t('sal.orders') },
    { key: 'customers' as const, href: '/sales/customers', label: t('sal.customers') },
  ];
  return (
    <div className="mb-4 flex gap-1 border-b">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
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
