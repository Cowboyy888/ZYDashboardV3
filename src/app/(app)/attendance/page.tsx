import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getEmployees, getAttendanceForDate } from '@/lib/db/queries';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { DateNav } from '@/components/attendance/date-nav';
import { AttendanceBoard } from './attendance-board';

export const dynamic = 'force-dynamic';

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePermission('attendance:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { date: dateParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : businessDate();

  const [employees, records] = await Promise.all([getEmployees(), getAttendanceForDate(date)]);

  return (
    <div>
      <PageHeader
        title={t('att.title')}
        description={`${formatDDMMYYYY(date)} · ${t('att.shifts')}`}
        actions={<DateNav date={date} />}
      />
      <AttendanceBoard
        employees={employees}
        records={records}
        date={date}
        canManage={hasPermission(user.role, 'attendance:manage')}
        canSend={hasPermission(user.role, 'telegram:send')}
      />
    </div>
  );
}
