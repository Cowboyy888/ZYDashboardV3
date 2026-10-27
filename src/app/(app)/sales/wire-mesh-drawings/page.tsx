import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getCustomers, getQuotations, getSalesOrders, getWireMeshDrawings } from '@/lib/db/queries';
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
  const customerName = new Map(customers.map((customer) => [customer.id, customer.name]));
  const references = [
    ...quotations.map((quotation) => ({
      key: `quotation:${quotation.id}`,
      kind: 'quotation' as const,
      id: quotation.id,
      customerName: quotation.customer_name,
      label: quotation.quotation_no ?? quotation.id.slice(0, 8),
    })),
    ...orders.map((order) => ({
      key: `order:${order.id}`,
      kind: 'order' as const,
      id: order.id,
      customerName: customerName.get(order.customer_id) ?? '—',
      label: order.so_number ?? order.id.slice(0, 8),
    })),
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
