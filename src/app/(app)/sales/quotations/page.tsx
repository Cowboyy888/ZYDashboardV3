import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getQuotations, getQuotationItems, getCustomers } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from '../sales-nav';
import { QuotationsClient } from './quotations-client';

export const dynamic = 'force-dynamic';

export default async function QuotationsPage() {
  const user = await requirePermission('sales:view');
  const locale = await getLocale();
  const t = translator(locale);

  const [quotations, items, customers] = await Promise.all([
    getQuotations(),
    getQuotationItems(),
    getCustomers(true),
  ]);

  return (
    <div>
      <PageHeader title={t('quo.title')} description={t('quo.desc')} />
      <SalesNav active="quotations" />
      <QuotationsClient
        quotations={quotations}
        items={items}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        canManage={hasPermission(user.role, 'sales:manage')}
      />
    </div>
  );
}
