import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPayrollRuns,
  getPayrollItems,
  getPayrollItemDeductions,
  getEmployees,
} from '@/lib/db/queries';
import { buildPayrollRunRows } from '@/lib/domain/payroll-view';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { RunsList } from './runs-list';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  const user = await requirePermission('payroll:view');
  const t = translator(await getLocale());
  const [runs, items, deductions, employees] = await Promise.all([
    getPayrollRuns(),
    getPayrollItems(),
    getPayrollItemDeductions(),
    getEmployees(true),
  ]);

  const rows = buildPayrollRunRows(runs, items, deductions, [], employees);

  return (
    <div>
      <PageHeader
        title={t('pay.title')}
        description={t('pay.desc')}
        actions={
          hasPermission(user.role, 'payroll:manage') ? (
            <Link href="/payroll/new" className={buttonVariants()}>
              {t('pay.newRun')}
            </Link>
          ) : undefined
        }
      />
      <RunsList rows={rows} />
    </div>
  );
}
