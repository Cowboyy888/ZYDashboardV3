'use client';
import Link from 'next/link';
import { useT } from '@/components/i18n-provider';
import { cn } from '@/lib/utils';
import { hasPermission, type Role } from '@/lib/domain/rbac';

/** Small sub-nav shared across the Sales section's pages. */
export function SalesNav({
  active,
  role,
}: {
  active: 'dashboard' | 'orders' | 'inquiries' | 'quotations' | 'customers' | 'targets' | 'kpi';
  role: Role;
}) {
  const { t } = useT();
  const items = [
    { key: 'dashboard' as const, href: '/sales', label: t('sal.dashboard') },
    { key: 'inquiries' as const, href: '/sales/inquiries', label: t('sal.inquiries') },
    { key: 'quotations' as const, href: '/sales/quotations', label: t('sal.quotations') },
    { key: 'orders' as const, href: '/sales/orders', label: t('sal.orders') },
    { key: 'customers' as const, href: '/sales/customers', label: t('sal.customers') },
    // Below permission checks mirror the same rbac.ts checks each target
    // page's requirePermission() call already enforces server-side — this
    // just keeps the tab from being offered when it would just redirect.
    ...(hasPermission(role, 'sales_targets:view')
      ? [{ key: 'targets' as const, href: '/sales/targets', label: t('sal.targets') }]
      : []),
    ...(hasPermission(role, 'kpi:view')
      ? [{ key: 'kpi' as const, href: '/sales/kpi', label: t('sal.kpi') }]
      : []),
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
