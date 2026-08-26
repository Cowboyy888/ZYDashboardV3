import { requirePermission } from '@/lib/auth';
import { getCustomers, getLocations, getSkus, getFamilies } from '@/lib/db/queries';
import { buildSkuLabel } from '@/lib/domain/products';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from '../../sales-nav';
import { NewSoForm } from './new-so-form';

export const dynamic = 'force-dynamic';

export default async function NewSalesOrderPage() {
  const user = await requirePermission('sales:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const [customers, locations, skus, families] = await Promise.all([
    getCustomers(),
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
      <PageHeader title={t('sal.newSo')} description={t('sal.newSoDesc')} />
      <SalesNav active="orders" role={user.role} />
      <NewSoForm
        customers={customers.map((c) => ({
          id: c.id,
          name: c.name,
          defaultCurrency: c.default_currency,
        }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        skuOptions={skuOptions}
        today={businessDate()}
      />
    </div>
  );
}
