import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import {
  getPriceRecordsPage,
  getPriceRecordCounts,
  getPriceHistoryForSkuIds,
  getPriceTypes,
  getSkus,
  getFamilies,
  getCustomers,
  getProfiles,
  DEFAULT_PAGE_SIZE,
  type PriceRecordFilters,
} from '@/lib/db/queries';
import type { PriceStatus } from '@/lib/domain/price-records';
import type { Currency } from '@/lib/domain/purchasing';
import { PRICE_STATUSES } from '@/lib/domain/price-records';
import { CURRENCIES } from '@/lib/domain/purchasing';
import { buildSkuLabel } from '@/lib/domain/products';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/ui/pagination';
import { SalesNav } from '../sales-nav';
import { PricesClient } from './prices-client';

export const dynamic = 'force-dynamic';

interface PriceRecordSearchParams {
  page?: string;
  q?: string;
  skuId?: string;
  customerId?: string;
  priceTypeId?: string;
  status?: string;
  currency?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export default async function PricesPage({
  searchParams,
}: {
  searchParams: Promise<PriceRecordSearchParams>;
}) {
  const user = await requirePermission('price_records:view');
  const locale = await getLocale();
  const t = translator(locale);
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);

  const filters: PriceRecordFilters = {
    skuId: sp.skuId || undefined,
    customerId: sp.customerId || undefined,
    priceTypeId: sp.priceTypeId || undefined,
    status:
      sp.status && (PRICE_STATUSES as readonly string[]).includes(sp.status)
        ? (sp.status as PriceStatus)
        : undefined,
    currency:
      sp.currency && (CURRENCIES as readonly string[]).includes(sp.currency)
        ? (sp.currency as Currency)
        : undefined,
    effectiveFrom: sp.effectiveFrom || undefined,
    effectiveTo: sp.effectiveTo || undefined,
  };

  const { rows: records, total } = await getPriceRecordsPage({
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    search: sp.q,
    filters,
  });

  const [counts, priceTypes, skus, families, customers, profiles] = await Promise.all([
    getPriceRecordCounts(),
    getPriceTypes(true),
    getSkus(true),
    getFamilies(true),
    getCustomers(true),
    getProfiles(),
  ]);
  const historyRows = await getPriceHistoryForSkuIds([...new Set(records.map((r) => r.sku_id))]);

  const familyName = new Map(families.map((f) => [f.id, f.name]));
  const skuOptions = skus.map((s) => ({
    id: s.id,
    unit: s.unit,
    familyName: familyName.get(s.family_id) ?? '—',
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
      <PageHeader title={t('pr.title')} description={t('pr.desc')} />
      <SalesNav active="prices" role={user.role} />
      <PricesClient
        records={records}
        historyRows={historyRows}
        counts={counts}
        priceTypes={priceTypes}
        skuOptions={skuOptions}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        profileName={Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.email]))}
        canManage={hasPermission(user.role, 'price_records:manage')}
        filters={{
          q: sp.q ?? '',
          skuId: sp.skuId ?? '',
          customerId: sp.customerId ?? '',
          priceTypeId: sp.priceTypeId ?? '',
          status: sp.status ?? '',
          currency: sp.currency ?? '',
          effectiveFrom: sp.effectiveFrom ?? '',
          effectiveTo: sp.effectiveTo ?? '',
        }}
      />
      <div className="mt-4">
        <Pagination
          locale={locale}
          page={page}
          pageSize={DEFAULT_PAGE_SIZE}
          total={total}
          basePath="/sales/prices"
          searchParams={{ ...sp, page: undefined }}
          prevLabel={t('common.previous')}
          nextLabel={t('common.next')}
        />
      </div>
    </div>
  );
}
