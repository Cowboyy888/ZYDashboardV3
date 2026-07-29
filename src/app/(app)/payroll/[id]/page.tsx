import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPayrollRun,
  getPayrollItems,
  getPayrollItemDeductions,
  getPayrollRunLines,
  getEmployees,
} from '@/lib/db/queries';
import { buildPayrollRunRows } from '@/lib/domain/payroll-view';
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

  const run = await getPayrollRun(id);
  if (!run) notFound();

  const [items, deductions, employees] = await Promise.all([
    getPayrollItems(id),
    getPayrollItemDeductions(),
    getEmployees(true),
  ]);
  const lines = await getPayrollRunLines(items.map((i) => i.id));

  const rows = buildPayrollRunRows([run], items, deductions, lines, employees);
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
