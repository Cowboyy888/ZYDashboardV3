import { requirePermission } from '@/lib/auth';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { NewRunForm } from './new-run-form';

export const dynamic = 'force-dynamic';

/** Default semi-monthly period (1st–15th, or 16th–end of month) around today. */
function defaultPeriod(today: string): { periodStart: string; periodEnd: string; payDate: string } {
  const parts = today.split('-').map(Number);
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d <= 15) {
    return {
      periodStart: `${y}-${pad(m)}-01`,
      periodEnd: `${y}-${pad(m)}-15`,
      payDate: `${y}-${pad(m)}-15`,
    };
  }
  const lastDay = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
  return {
    periodStart: `${y}-${pad(m)}-16`,
    periodEnd: `${y}-${pad(m)}-${pad(lastDay)}`,
    payDate: `${y}-${pad(m)}-${pad(lastDay)}`,
  };
}

export default async function NewPayrollRunPage() {
  await requirePermission('payroll:manage');
  const t = translator(await getLocale());
  const today = businessDate();

  return (
    <div>
      <PageHeader title={t('pay.newRun')} description={t('pay.newRunDesc')} />
      <NewRunForm defaults={defaultPeriod(today)} />
    </div>
  );
}
