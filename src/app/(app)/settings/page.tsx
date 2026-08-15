import Link from 'next/link';
import { MapPin, Package, Send, Users, ShieldCheck, ListOrdered, Globe } from 'lucide-react';
import { requirePermission } from '@/lib/auth';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { hasPermission } from '@/lib/domain/rbac';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const user = await requirePermission('settings:view');
  const locale = await getLocale();
  const t = translator(locale);

  const items = [
    {
      href: '/settings/locations',
      icon: MapPin,
      label: t('set.locations'),
      show: hasPermission(user.role, 'locations:manage'),
    },
    {
      href: '/settings/products',
      icon: Package,
      label: t('set.products'),
      show: hasPermission(user.role, 'products:manage'),
    },
    {
      href: '/settings/attendance-groups',
      icon: ListOrdered,
      label: t('set.groups'),
      show: hasPermission(user.role, 'settings:manage'),
    },
    {
      href: '/settings/telegram',
      icon: Send,
      label: t('set.telegram'),
      show: hasPermission(user.role, 'telegram:manage'),
    },
    {
      href: '/settings/users',
      icon: Users,
      label: t('set.users'),
      show: hasPermission(user.role, 'users:manage'),
    },
    {
      href: '/settings/audit',
      icon: ShieldCheck,
      label: t('set.audit'),
      show: hasPermission(user.role, 'audit:view'),
    },
    {
      href: '/settings/logins',
      icon: Globe,
      label: t('set.logins'),
      show: hasPermission(user.role, 'audit:view'),
    },
  ].filter((i) => i.show);

  return (
    <div>
      <PageHeader title={t('nav.settings')} description={t('set.subtitle')} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <Card className="transition-colors hover:border-primary/50 hover:bg-accent/50">
                <CardContent className="flex items-center gap-3 p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="font-medium">{item.label}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
