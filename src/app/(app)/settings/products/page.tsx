import { requirePermission } from '@/lib/auth';
import { getFamilies, getSkus } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { ProductsManager } from './products-manager';

export const dynamic = 'force-dynamic';

export default async function ProductsSettingsPage() {
  await requirePermission('products:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const [families, skus] = await Promise.all([getFamilies(true), getSkus(true)]);
  return (
    <div>
      <PageHeader title={t('set.products')} description={t('set.productsDesc')} />
      <ProductsManager families={families} skus={skus} />
    </div>
  );
}
