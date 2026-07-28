import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { buildAttendancePreview } from '@/lib/reports/preview';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { DateNav } from '@/components/attendance/date-nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SendNowButton } from '@/components/telegram/send-now-button';
import { sendMorningNow, sendAfternoonNow } from '@/lib/actions/telegram';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const user = await requirePermission('attendance:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { date: dateParam } = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam ?? '') ? dateParam! : businessDate();
  const isToday = date === businessDate();
  const canSend = hasPermission(user.role, 'telegram:send');

  const [morning, afternoon] = await Promise.all([
    buildAttendancePreview(date, 'morning'),
    buildAttendancePreview(date, 'afternoon'),
  ]);

  const block = (
    title: string,
    text: string,
    action: () => Promise<import('@/lib/actions/types').ActionState>,
  ) => (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        {canSend && isToday && <SendNowButton action={action} label={t('common.sendNow')} />}
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
        {block(t('rp.morning'), morning.text, sendMorningNow)}
        {block(t('rp.afternoon'), afternoon.text, sendAfternoonNow)}
      </div>
      {canSend && <p className="mt-3 text-xs text-muted-foreground">{t('rp.sendNote')}</p>}
    </div>
  );
}
