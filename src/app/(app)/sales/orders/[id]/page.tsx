import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getSalesOrder,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getSalesOrderDeliveries,
  getCustomer,
  getSkus,
  getFamilies,
  getLocations,
  getProfiles,
  getDepositInvoiceForSo,
  getQuotation,
  getQuotationItems,
} from '@/lib/db/queries';
import type { QuotationRow, QuotationItemRow } from '@/lib/db/types';
import { buildSalesOrderRows } from '@/lib/domain/sales-view';
import { buildSkuLabel } from '@/lib/domain/products';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { PageHeader } from '@/components/page-header';
import { SoDetail } from './so-detail';

export const dynamic = 'force-dynamic';

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission('sales:view');
  const locale = await getLocale();

  const so = await getSalesOrder(id);
  if (!so) notFound();

  // sourceQuotation only needs so.quotation_id (known above), so it runs
  // alongside the main batch instead of waiting on it.
  const [
    [items, customer, skus, families, locations, profiles, depositInvoice],
    [sourceQuotation, sourceQuotationItems],
  ] = await Promise.all([
    Promise.all([
      getSalesOrderItems(id),
      getCustomer(so.customer_id),
      getSkus(true),
      getFamilies(true),
      getLocations(true),
      getProfiles(),
      getDepositInvoiceForSo(id),
    ]),
    so.quotation_id
      ? Promise.all([getQuotation(so.quotation_id), getQuotationItems(so.quotation_id)])
      : Promise.resolve([null, []] as [QuotationRow | null, QuotationItemRow[]]),
  ]);
  const itemIds = items.map((i) => i.id);
  const [delivered, deliveries] = await Promise.all([
    getSalesOrderItemsDelivered(itemIds),
    getSalesOrderDeliveries(itemIds),
  ]);

  const rows = buildSalesOrderRows(
    [so],
    items,
    delivered,
    customer ? [{ id: customer.id, name: customer.name }] : [],
    skus,
    families,
    businessDate(),
    locale,
  );
  const row = rows[0];
  if (!row) notFound();
  const locationName = new Map(locations.map((l) => [l.id, l.name]));
  const profileName = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));
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
      <PageHeader title={row.soNumber} description={customer?.name ?? '—'} />
      <SoDetail
        row={row}
        so={so}
        locationName={Object.fromEntries(locationName)}
        deliveries={deliveries}
        profileName={Object.fromEntries(profileName)}
        today={businessDate()}
        canManage={hasPermission(user.role, 'sales:manage')}
        canOverride={hasPermission(user.role, 'stock:override_negative')}
        depositInvoice={depositInvoice}
        sourceQuotation={sourceQuotation}
        sourceQuotationItems={sourceQuotationItems}
        skuOptions={skuOptions}
      />
    </div>
  );
}
