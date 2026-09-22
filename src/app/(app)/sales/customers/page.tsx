import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getCustomers, getInquiryCustomerTypes } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from '../sales-nav';
import { CustomersManager } from './customers-manager';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const user = await requirePermission('sales:view');
  const locale = await getLocale();
  const t = translator(locale);
  const [customers, customerTypes] = await Promise.all([
    getCustomers(true),
    getInquiryCustomerTypes(),
  ]);

  return (
    <div>
      <PageHeader title={t('sal.customers')} description={t('sal.customersDesc')} />
      <SalesNav active="customers" role={user.role} />
      <CustomersManager
        customers={customers}
        customerTypes={customerTypes.map((c) => ({ id: c.id, name: c.name }))}
        canManage={hasPermission(user.role, 'sales:manage')}
      />
    </div>
  );
}
