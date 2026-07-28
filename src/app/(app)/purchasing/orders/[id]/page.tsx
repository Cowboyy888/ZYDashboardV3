import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPurchaseOrder,
  getPurchaseOrderItems,
  getPurchaseOrderItemsReceived,
  getPurchaseOrderReceipts,
  getSupplier,
  getSkus,
  getFamilies,
  getLocations,
  getProfiles,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
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
  const locale = await getLocale();

  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const [items, received, supplier, skus, families, locations, profiles] = await Promise.all([
    getPurchaseOrderItems(id),
    getPurchaseOrderItemsReceived(),
    getSupplier(po.supplier_id),
    getSkus(true),
    getFamilies(true),
    getLocations(true),
    getProfiles(),
  ]);
  const receipts = await getPurchaseOrderReceipts(items.map((i) => i.id));

  const rows = buildPurchaseOrderRows(
    [po],
    items,
    received,
    supplier ? [{ id: supplier.id, name: supplier.name }] : [],
    skus,
    families,
    businessDate(),
    locale,
  );
  const row = rows[0];
  if (!row) notFound();
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const profileName = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));

  return (
    <div>
      <PageHeader title={row.poNumber} description={supplier?.name ?? '—'} />
      <PoDetail
        row={row}
        po={po}
        locationName={Object.fromEntries(locationName)}
        receipts={receipts}
        profileName={Object.fromEntries(profileName)}
        today={businessDate()}
        canManage={hasPermission(user.role, 'purchasing:manage')}
        canOverride={hasPermission(user.role, 'stock:override_negative')}
      />
    </div>
  );
}
