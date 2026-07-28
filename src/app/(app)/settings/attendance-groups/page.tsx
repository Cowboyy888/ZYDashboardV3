import { requirePermission } from '@/lib/auth';
import { getAttendanceGroups } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { AttendanceGroupsManager } from './attendance-groups-manager';

export const dynamic = 'force-dynamic';

export default async function AttendanceGroupsSettingsPage() {
  await requirePermission('settings:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const groups = await getAttendanceGroups(true);
  return (
    <div>
      <PageHeader title={t('set.groups')} description={t('set.groupsDesc')} />
      <AttendanceGroupsManager groups={groups} />
    </div>
  );
}
