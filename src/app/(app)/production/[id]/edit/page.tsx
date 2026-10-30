import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { getProductionOrder, getProductionReferences } from '@/lib/db/queries';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { ProductionForm } from '../../production-form';

export const dynamic = 'force-dynamic';
export default async function EditProduction({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('production:manage');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const row = await getProductionOrder(id);
  if (!row) notFound();
  if (row.status !== 'draft') redirect(`/production/${id}`);
  const t = translator(await getLocale());
  const [sales_items, skus, drawings, supervisors] = await Promise.all([
    getProductionReferences('sales_items', '', row.sales_order_item_id ?? undefined),
    getProductionReferences('skus', '', row.sku_id),
    getProductionReferences('drawings', '', row.drawing_id),
    getProductionReferences('supervisors', '', row.supervisor_id ?? undefined),
  ]);
  return (
    <div>
      <PageHeader
        title={`${t('production.edit')} · ${row.order_number}`}
        description={t('production.scope')}
      />
      <ProductionForm
        key={row.version}
        id={id}
        today={businessDate()}
        row={row}
        options={{ sales_items, skus, drawings, supervisors }}
      />
    </div>
  );
}
