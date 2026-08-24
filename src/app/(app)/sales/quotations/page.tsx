import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getQuotationsPage,
  getQuotationItems,
  getCustomers,
  getSalesOrdersByQuotationIds,
  DEFAULT_PAGE_SIZE,
} from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { SearchBox } from '@/components/ui/search-box';
import { Pagination } from '@/components/ui/pagination';
import { SalesNav } from '../sales-nav';
import { QuotationsClient } from './quotations-client';

export const dynamic = 'force-dynamic';

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const user = await requirePermission('sales:view');
  const locale = await getLocale();
  const t = translator(locale);
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  const { rows: quotations, total } = await getQuotationsPage({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    search: q,
  });
  const quotationIds = quotations.map((quo) => quo.id);

  const [items, customers, linkedOrders] = await Promise.all([
    getQuotationItems(quotationIds),
    getCustomers(true),
    getSalesOrdersByQuotationIds(quotationIds),
  ]);

  return (
    <div>
      <PageHeader title={t('quo.title')} description={t('quo.desc')} />
      <SalesNav active="quotations" />
      <div className="mb-4">
        <SearchBox placeholder={t('quo.searchQuotations')} />
      </div>
      <QuotationsClient
        quotations={quotations}
        items={items}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        canManage={hasPermission(user.role, 'sales:manage')}
        linkedOrders={linkedOrders.map((o) => ({
          quotationId: o.quotation_id as string,
          soId: o.id,
          soNumber: o.so_number,
        }))}
        isSearching={!!q?.trim()}
      />
      <div className="mt-4">
        <Pagination
          locale={locale}
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={total}
          basePath="/sales/quotations"
          searchParams={{ q }}
          prevLabel={t('common.previous')}
          nextLabel={t('common.next')}
        />
      </div>
    </div>
  );
}
