import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getSalesTargets, getEmployees } from '@/lib/db/queries';
import { buildSalesTargetRows } from '@/lib/domain/kpi-view';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from '../sales-nav';
import { TargetsManager } from './targets-manager';

export const dynamic = 'force-dynamic';

const PERIOD_RE = /^\d{4}-\d{2}$/;

export default async function SalesTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission('sales_targets:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { period } = await searchParams;
  const activePeriod = period && PERIOD_RE.test(period) ? period : businessDate().slice(0, 7);

  const [targets, employees] = await Promise.all([getSalesTargets(activePeriod), getEmployees()]);
  const rows = buildSalesTargetRows(targets, employees);

  return (
    <div>
      <PageHeader title={t('tgt.title')} description={t('tgt.desc')} />
      <SalesNav active="targets" role={user.role} />
      <TargetsManager
        rows={rows}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.display_name || e.name_english || e.name_chinese || e.employee_code,
        }))}
        canManage={hasPermission(user.role, 'sales_targets:manage')}
        activePeriod={activePeriod}
      />
    </div>
  );
}
