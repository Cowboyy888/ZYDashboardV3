import { requirePermission } from '@/lib/auth';
import { getLoginEvents } from '@/lib/db/queries';
import { formatDateTime } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function LoginHistoryPage() {
  await requirePermission('audit:view');
  const locale = await getLocale();
  const t = translator(locale);
  const events = await getLoginEvents(200);
  return (
    <div>
      <PageHeader title={t('set.logins')} description={t('set.loginsDesc')} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('set.when')}</TableHead>
                <TableHead>{t('set.user')}</TableHead>
                <TableHead>{t('set.ipAddress')}</TableHead>
                <TableHead>{t('common.location')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id} title={e.user_agent ?? undefined}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">{e.email ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.ip_address ?? '—'}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[e.city, e.country].filter(Boolean).join(', ') || '—'}
                  </TableCell>
                </TableRow>
              ))}
              {events.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('set.noLogins')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
