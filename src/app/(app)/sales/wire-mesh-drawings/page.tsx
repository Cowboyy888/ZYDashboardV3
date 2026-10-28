import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getCustomers,
  getQuotationItems,
  getQuotations,
  getSalesOrderItems,
  getSalesOrders,
  getSkus,
  getWireMeshDrawings,
} from '@/lib/db/queries';
import { deriveWireMeshDrawingPrefill } from '@/lib/domain/wire-mesh-prefill';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from '../sales-nav';
import { WireMeshDrawingsClient } from './wire-mesh-drawings-client';

export const dynamic = 'force-dynamic';

export default async function WireMeshDrawingsPage() {
  const user = await requirePermission('sales:view');
  const locale = await getLocale();
  const t = translator(locale);
  const [drawings, quotations, orders, customers] = await Promise.all([
    getWireMeshDrawings(),
    getQuotations(),
    getSalesOrders(),
    getCustomers(true),
  ]);
  const [quotationItems, orderItems] = await Promise.all([
    getQuotationItems(quotations.map((quotation) => quotation.id)),
    getSalesOrderItems(orders.map((order) => order.id)),
  ]);
  const skus = await getSkus(true, [...new Set(orderItems.map((item) => item.sku_id))]);
  const customerName = new Map(customers.map((customer) => [customer.id, customer.name]));
  const quotationItem = new Map<string, (typeof quotationItems)[number]>();
  for (const item of quotationItems) {
    if (!quotationItem.has(item.quotation_id)) quotationItem.set(item.quotation_id, item);
  }
  const orderItem = new Map<string, (typeof orderItems)[number]>();
  for (const item of orderItems) {
    if (!orderItem.has(item.sales_order_id)) orderItem.set(item.sales_order_id, item);
  }
  const skuById = new Map(skus.map((sku) => [sku.id, sku]));
  const references = [
    ...quotations.map((quotation) => {
      const item = quotationItem.get(quotation.id);
      return {
        key: `quotation:${quotation.id}`,
        kind: 'quotation' as const,
        id: quotation.id,
        customerName: quotation.customer_name,
        label: quotation.quotation_no ?? quotation.id.slice(0, 8),
        prefill: deriveWireMeshDrawingPrefill({
          customerName: quotation.customer_name,
          meshSpecification: item?.description,
          wireDiameter: item?.wire_dia,
          unit: item?.unit,
          quantity: item?.quantity,
          totalSheets: item?.total_sheets,
        }),
      };
    }),
    ...orders.map((order) => {
      const item = orderItem.get(order.id);
      const sku = item ? skuById.get(item.sku_id) : undefined;
      const spec = [sku?.diameter, sku?.size, sku?.hole, sku?.rod_count]
        .filter((value): value is string => Boolean(value?.trim()))
        .join(' | ');
      const name = customerName.get(order.customer_id) ?? '—';
      return {
        key: `order:${order.id}`,
        kind: 'order' as const,
        id: order.id,
        customerName: name,
        label: order.so_number ?? order.id.slice(0, 8),
        prefill: deriveWireMeshDrawingPrefill({
          customerName: name,
          meshSpecification: spec,
          size: sku?.size,
          wireDiameter: sku?.diameter,
          unit: item?.unit,
          quantity: item?.ordered_qty,
        }),
      };
    }),
  ];
  return (
    <div>
      <PageHeader title={t('mesh.title')} description={t('mesh.desc')} />
      <SalesNav active="drawings" role={user.role} />
      <WireMeshDrawingsClient
        drawings={drawings}
        references={references}
        canManage={hasPermission(user.role, 'sales:manage')}
      />
    </div>
  );
}
