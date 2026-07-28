import { requirePermission } from '@/lib/auth';
import { getSuppliers, getLocations, getSkus, getFamilies } from '@/lib/db/queries';
import { buildSkuLabel } from '@/lib/domain/products';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { PurchasingNav } from '../../purchasing-nav';
import { NewPoForm } from './new-po-form';

export const dynamic = 'force-dynamic';

export default async function NewPurchaseOrderPage() {
  await requirePermission('purchasing:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const [suppliers, locations, skus, families] = await Promise.all([
    getSuppliers(),
    getLocations(),
    getSkus(),
    getFamilies(true),
  ]);

  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const skuOptions = skus.map((s) => ({
    id: s.id,
    unit: s.unit,
    label: buildSkuLabel(
      {
        familyName: familyName.get(s.family_id) ?? '—',
        diameter: s.diameter,
        size: s.size,
        hole: s.hole,
        rodCount: s.rod_count,
        extra: s.extra,
        condition: s.condition,
        unit: s.unit,
      },
      locale,
    ),
  }));

  return (
    <div>
      <PageHeader title={t('pur.newPo')} description={t('pur.newPoDesc')} />
      <PurchasingNav active="orders" />
      <NewPoForm
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          defaultCurrency: s.default_currency,
        }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        skuOptions={skuOptions}
        today={businessDate()}
      />
    </div>
  );
}
