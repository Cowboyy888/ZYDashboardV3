import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getEmployees, getOvertimeEntries, getOvertimeSettings } from '@/lib/db/queries';
import { employeeDisplayName } from '@/lib/domain/payroll-view';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { OvertimeDashboard } from './overtime-dashboard';

export const dynamic = 'force-dynamic';

/** Default window: the current calendar month (matches the monthly 加班表). */
function monthRange(today: string): { from: string; to: string } {
  const [y, m] = today.split('-');
  const last = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(last).padStart(2, '0')}` };
}

export default async function OvertimePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requirePermission('overtime:view');
  const locale = await getLocale();
  const t = translator(locale);

  const { from: fromParam, to: toParam } = await searchParams;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const fallback = monthRange(businessDate());
  const from = iso.test(fromParam ?? '') ? fromParam! : fallback.from;
  const to = iso.test(toParam ?? '') ? toParam! : fallback.to;

  const [entries, settings, employees] = await Promise.all([
    getOvertimeEntries(from, to),
    getOvertimeSettings(),
    getEmployees(),
  ]);

  return (
    <div>
      <PageHeader title={t('ot.title')} description={t('ot.desc')} />
      <OvertimeDashboard
        entries={entries}
        settings={settings}
        employees={employees.map((e) => ({ id: e.id, name: employeeDisplayName(e) }))}
        from={from}
        to={to}
        canManage={hasPermission(user.role, 'overtime:manage')}
        canEditRates={hasPermission(user.role, 'settings:manage')}
      />
    </div>
  );
}
