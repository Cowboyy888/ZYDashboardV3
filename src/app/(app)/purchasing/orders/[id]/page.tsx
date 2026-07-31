import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getPurchaseOrder, getSupplier } from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { businessDate } from '@/lib/domain/datetime';
import { PageHeader } from '@/components/page-header';
import { PoDetail } from './po-detail';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission('purchasing:view');

  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const supplier = await getSupplier(po.supplier_id);

  const rows = buildPurchaseOrderRows(
    [po],
    supplier ? [{ id: supplier.id, name: supplier.name }] : [],
    businessDate(),
  );
  const row = rows[0];
  if (!row) notFound();

  return (
    <div>
      <PageHeader title={row.poNumber} description={supplier?.name ?? '—'} />
      <PoDetail row={row} po={po} canManage={hasPermission(user.role, 'purchasing:manage')} />
    </div>
  );
}
