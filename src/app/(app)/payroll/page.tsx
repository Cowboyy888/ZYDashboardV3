import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPayrollRunsPage,
  getPayrollItems,
  getPayrollItemsLive,
  getPayrollItemDeductions,
  getEmployees,
  DEFAULT_PAGE_SIZE,
} from '@/lib/db/queries';
import { buildPayrollRunRows } from '@/lib/domain/payroll-view';
import { isPayrollLive } from '@/lib/domain/payroll';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { buttonVariants } from '@/components/ui/button-variants';
import { Pagination } from '@/components/ui/pagination';
import { RunsList } from './runs-list';

export const dynamic = 'force-dynamic';

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requirePermission('payroll:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { rows: runs, total } = await getPayrollRunsPage({ page, pageSize: DEFAULT_PAGE_SIZE });
  const runIds = runs.map((r) => r.id);

  const [items, employees] = await Promise.all([getPayrollItems(runIds), getEmployees(true)]);

  // Draft and Approved runs' items need the live recompute — only Paid/
  // Cancelled runs keep their frozen snapshot.
  const liveRunIds = new Set(runs.filter((r) => isPayrollLive(r.status)).map((r) => r.id));
  const liveItemIds = items.filter((it) => liveRunIds.has(it.payroll_run_id)).map((it) => it.id);
  const [deductions, liveItems] = await Promise.all([
    getPayrollItemDeductions(items.map((it) => it.id)),
    getPayrollItemsLive(liveItemIds),
  ]);

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
      <div className="mt-4">
        <Pagination
          locale={locale}
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={total}
          basePath="/payroll"
          prevLabel={t('common.previous')}
          nextLabel={t('common.next')}
        />
      </div>
    </div>
  );
}
