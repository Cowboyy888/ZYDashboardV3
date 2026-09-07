import { requirePermission } from '@/lib/auth';
import { getPriceTypes } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { PriceTypesManager } from './price-types-manager';

export const dynamic = 'force-dynamic';

export default async function PriceTypesSettingsPage() {
  await requirePermission('price_records:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const priceTypes = await getPriceTypes(true);
  return (
    <div>
      <PageHeader title={t('pr.priceTypes')} description={t('pr.priceTypesDesc')} />
      <PriceTypesManager priceTypes={priceTypes} />
    </div>
  );
}
