import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPayrollRuns,
  getPayrollItems,
  getPayrollItemsLive,
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

  // Only Draft runs' items need the live recompute — Approved/Paid/Cancelled
  // keep their frozen snapshot.
  const draftRunIds = new Set(runs.filter((r) => r.status === 'draft').map((r) => r.id));
  const draftItemIds = items.filter((it) => draftRunIds.has(it.payroll_run_id)).map((it) => it.id);
  const liveItems = await getPayrollItemsLive(draftItemIds);

  const rows = buildPayrollRunRows(runs, items, deductions, [], employees, liveItems);

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
