import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPurchaseOrder,
  getPurchaseOrderItems,
  getSupplier,
  getSuppliers,
  getSkus,
  getFamilies,
  getLocations,
} from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { buildSkuLabel } from '@/lib/domain/products';
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

  const [items, supplier, suppliers, skus, families, locations] = await Promise.all([
    getPurchaseOrderItems(id),
    getSupplier(po.supplier_id),
    getSuppliers(true), // include archived — the PO's own supplier might have been archived since
    getSkus(true),
    getFamilies(true),
    getLocations(true),
  ]);

  const rows = buildPurchaseOrderRows(
    [po],
    items,
    supplier ? [{ id: supplier.id, name: supplier.name }] : [],
    skus,
    families,
    locale,
  );
  const row = rows[0];
  if (!row) notFound();

  const locationName = new Map(locations.map((l) => [l.id, l.name]));
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
      <PageHeader title={row.poNumber} description={supplier?.name ?? '—'} />
      <PoDetail
        row={row}
        po={po}
        suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        locationName={Object.fromEntries(locationName)}
        skuOptions={skuOptions}
        families={families
          .filter((f) => f.is_active)
          .map((f) => ({ id: f.id, name: f.name, nameEnglish: f.name_english }))}
        canManage={hasPermission(user.role, 'purchasing:manage')}
        canCreateSpec={hasPermission(user.role, 'products:manage')}
      />
    </div>
  );
}
