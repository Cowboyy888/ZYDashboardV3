import { randomUUID } from 'node:crypto';
import { requirePermission } from '@/lib/auth';
import { getProductionReferences } from '@/lib/db/queries';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { ProductionForm } from '../production-form';

export const dynamic = 'force-dynamic';
export default async function NewProductionPage() {
  await requirePermission('production:manage');
  const t = translator(await getLocale());
  const [sales_items, skus, drawings, supervisors] = await Promise.all([
    getProductionReferences('sales_items'),
    getProductionReferences('skus'),
    getProductionReferences('drawings'),
    getProductionReferences('supervisors'),
  ]);
  return (
    <div>
      <PageHeader title={t('production.new')} description={t('production.scope')} />
      <ProductionForm
        id={randomUUID()}
        today={businessDate()}
        options={{ sales_items, skus, drawings, supervisors }}
      />
    </div>
  );
}
