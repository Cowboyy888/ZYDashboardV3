import { requirePermission } from '@/lib/auth';
import { getProfiles } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { UsersManager } from './users-manager';

export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage() {
  await requirePermission('users:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const profiles = await getProfiles();
  return (
    <div>
      <PageHeader title={t('set.users')} description={t('set.usersDesc')} />
      <UsersManager profiles={profiles} />
    </div>
  );
}
