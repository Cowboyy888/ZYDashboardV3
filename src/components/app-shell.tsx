'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  CalendarCheck,
  Users,
  Boxes,
  ShoppingCart,
  Truck,
  Wallet,
  BarChart3,
  Settings,
  Menu,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasPermission, ROLE_LABELS, type Permission, type Role } from '@/lib/domain/rbac';
import { translator, type Locale, type MessageKey } from '@/lib/i18n';
import { ZysteelLogo } from '@/components/brand/logo';
import { LanguageSwitch } from '@/components/language-switch';
import { Button } from '@/components/ui/button';
import { signOutAction } from '@/lib/actions/auth';

interface NavItem {
  href: string;
  key: MessageKey;
  icon: LucideIcon;
  permission: Permission;
}

const NAV: NavItem[] = [
  { href: '/dashboard', key: 'nav.dashboard', icon: LayoutDashboard, permission: 'dashboard:view' },
  {
    href: '/attendance',
    key: 'nav.attendance',
    icon: CalendarCheck,
    permission: 'attendance:view',
  },
  { href: '/employees', key: 'nav.employees', icon: Users, permission: 'employees:view' },
  { href: '/inventory', key: 'nav.inventory', icon: Boxes, permission: 'inventory:view' },
  { href: '/purchasing', key: 'nav.purchasing', icon: ShoppingCart, permission: 'purchasing:view' },
  { href: '/sales', key: 'nav.sales', icon: Truck, permission: 'sales:view' },
  { href: '/payroll', key: 'nav.payroll', icon: Wallet, permission: 'payroll:view' },
  { href: '/reports', key: 'nav.reports', icon: BarChart3, permission: 'attendance:view' },
  { href: '/settings', key: 'nav.settings', icon: Settings, permission: 'settings:view' },
];

export interface ShellUser {
  email: string;
  fullName: string | null;
  role: Role;
}

export function AppShell({
  user,
  locale,
  children,
}: {
  user: ShellUser;
  locale: Locale;
  children: React.ReactNode;
}) {
  const t = translator(locale);
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => hasPermission(user.role, n.permission));

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-slate-300 hover:bg-white/10 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            {t(item.key)}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col bg-[hsl(208_18%_13%)] py-5 lg:flex">
        <div className="mb-6 px-5">
          <ZysteelLogo invert />
        </div>
        {nav}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-[hsl(208_18%_13%)] py-5">
            <div className="mb-6 px-5">
              <ZysteelLogo invert />
            </div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div>
            <ZysteelLogo showWordmark={false} size={28} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitch />
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium leading-tight">{user.fullName || user.email}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[user.role][locale]}</div>
            </div>
            <form action={signOutAction}>
              <Button variant="ghost" size="icon" type="submit" title={t('nav.signOut')}>
                <LogOut className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
