import { requirePermission } from '@/lib/auth';
import { getLocations } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { LocationsManager } from './locations-manager';

export const dynamic = 'force-dynamic';

export default async function LocationsSettingsPage() {
  await requirePermission('locations:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const locations = await getLocations(true);
  return (
    <div>
      <PageHeader title={t('set.locations')} description={t('set.locationsDesc')} />
      <LocationsManager locations={locations} />
    </div>
  );
}
