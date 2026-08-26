import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getKpiScorecards, getKpiScorecardLines, getEmployees } from '@/lib/db/queries';
import { buildKpiScorecardRows } from '@/lib/domain/kpi-view';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from '../sales-nav';
import { KpiManager } from './kpi-manager';

export const dynamic = 'force-dynamic';

const PERIOD_RE = /^\d{4}-\d{2}$/;

export default async function KpiScorecardsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission('kpi:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { period } = await searchParams;
  const activePeriod = period && PERIOD_RE.test(period) ? period : businessDate().slice(0, 7);

  const [scorecards, employees] = await Promise.all([
    getKpiScorecards(activePeriod),
    getEmployees(),
  ]);
  const lines = await getKpiScorecardLines(scorecards.map((s) => s.id));
  const rows = buildKpiScorecardRows(scorecards, lines, employees);

  return (
    <div>
      <PageHeader title={t('kpi.title')} description={t('kpi.desc')} />
      <SalesNav active="kpi" role={user.role} />
      <KpiManager
        rows={rows}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.display_name || e.name_english || e.name_chinese || e.employee_code,
        }))}
        canManage={hasPermission(user.role, 'kpi:manage')}
        activePeriod={activePeriod}
      />
    </div>
  );
}
