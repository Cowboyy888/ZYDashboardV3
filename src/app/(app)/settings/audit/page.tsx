import { requirePermission } from '@/lib/auth';
import { getAuditLog } from '@/lib/db/queries';
import { formatDateTime } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requirePermission('audit:view');
  const locale = await getLocale();
  const t = translator(locale);
  const entries = await getAuditLog(200);
  return (
    <div>
      <PageHeader title={t('set.audit')} description={t('set.auditDesc')} />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('set.when')}</TableHead>
                <TableHead>{t('set.actor')}</TableHead>
                <TableHead>{t('set.action')}</TableHead>
                <TableHead>{t('set.entity')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">{e.actor_email ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{e.action}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.entity}
                    {e.entity_id ? ` · ${e.entity_id.slice(0, 8)}` : ''}
                  </TableCell>
                </TableRow>
              ))}
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('set.noAudit')}
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
