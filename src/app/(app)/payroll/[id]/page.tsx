import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPayrollRun,
  getPayrollItems,
  getPayrollItemsLive,
  getPayrollItemDeductions,
  getPayrollRunLines,
  getEmployees,
} from '@/lib/db/queries';
import { buildPayrollRunRows } from '@/lib/domain/payroll-view';
import { isPayrollLive } from '@/lib/domain/payroll';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { RunDetail } from './run-detail';

export const dynamic = 'force-dynamic';

export default async function PayrollRunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission('payroll:view');
  const t = translator(await getLocale());

  // getPayrollItems only needs the route id (not the run row), so it runs
  // alongside getPayrollRun instead of waiting on it.
  const [run, items, employees] = await Promise.all([
    getPayrollRun(id),
    getPayrollItems(id),
    getEmployees(true),
  ]);
  if (!run) notFound();

  const itemIds = items.map((i) => i.id);
  const [deductions, lines, liveItems] = await Promise.all([
    getPayrollItemDeductions(itemIds),
    getPayrollRunLines(itemIds),
    isPayrollLive(run.status) ? getPayrollItemsLive(itemIds) : Promise.resolve([]),
  ]);

  const rows = buildPayrollRunRows([run], items, deductions, lines, employees, liveItems);
  const row = rows[0];
  if (!row) notFound();

  return (
    <div>
      <PageHeader
        title={`${t('pay.title')}: ${formatDDMMYYYY(row.periodStart)} – ${formatDDMMYYYY(row.periodEnd)}`}
        description={t('pay.payDate') + ': ' + formatDDMMYYYY(row.payDate)}
        actions={
          <a href={`/api/export/payroll/${id}`} className={buttonVariants({ variant: 'outline' })}>
            {t('common.exportExcel')}
          </a>
        }
      />
      <RunDetail
        row={row}
        canManage={hasPermission(user.role, 'payroll:manage')}
        canApprove={hasPermission(user.role, 'payroll:approve')}
      />
    </div>
  );
}
