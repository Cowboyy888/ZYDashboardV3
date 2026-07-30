import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { hasPermission, hasAnyPermission } from '@/lib/domain/rbac';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildAttendancePreview, buildInventoryPreview } from '@/lib/reports/preview';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { DateNav } from '@/components/attendance/date-nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SendNowButton } from '@/components/telegram/send-now-button';
import { sendMorningNow, sendAfternoonNow, sendInventoryNow } from '@/lib/actions/telegram';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const canAttendance = hasPermission(user.role, 'attendance:view');
  const canInventory = hasPermission(user.role, 'inventory:view');
  if (!hasAnyPermission(user.role, ['attendance:view', 'inventory:view'])) {
    redirect('/dashboard?denied=1');
  }
  const locale = await getLocale();
  const t = translator(locale);
  const { date: dateParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : businessDate();
  const isToday = date === businessDate();
  const canSend = hasPermission(user.role, 'telegram:send');

  const [morning, afternoon, inventory] = await Promise.all([
    canAttendance ? buildAttendancePreview(date, 'morning') : Promise.resolve(null),
    canAttendance ? buildAttendancePreview(date, 'afternoon') : Promise.resolve(null),
    canInventory ? buildInventoryPreview(date) : Promise.resolve(null),
  ]);

  const block = (
    title: string,
    text: string,
    action: () => Promise<import('@/lib/actions/types').ActionState>,
  ) => (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {canSend && isToday && (
          <SendNowButton
            action={action}
            label={t('common.sendNow')}
            confirmText={t('common.confirmSendReport')}
          />
        )}
      </CardHeader>
      <CardContent>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-[hsl(208_18%_13%)] p-4 font-mono text-[13px] leading-relaxed text-slate-100">
          {text}
        </pre>
      </CardContent>
    </Card>
  );

  return (
    <div>
      <PageHeader
        title={t('rp.title')}
        description={`${formatDDMMYYYY(date)} · ${t('rp.desc')}`}
        actions={<DateNav date={date} />}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {canAttendance && morning && block(t('rp.morning'), morning.text, sendMorningNow)}
        {canAttendance && afternoon && block(t('rp.afternoon'), afternoon.text, sendAfternoonNow)}
        {canInventory && inventory && block(t('rp.inventory'), inventory, sendInventoryNow)}
      </div>
      {canSend && <p className="mt-3 text-xs text-muted-foreground">{t('rp.sendNote')}</p>}
    </div>
  );
}
