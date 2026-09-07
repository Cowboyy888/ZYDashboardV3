import type { PriceRecordFilters } from '@/lib/db/queries';
import type { PriceStatus } from '@/lib/domain/price-records';
import type { Currency } from '@/lib/domain/purchasing';
import { PRICE_STATUSES } from '@/lib/domain/price-records';
import { CURRENCIES } from '@/lib/domain/purchasing';

/**
 * Reads the same filter params the Prices list page puts on its download
 * links (prices-client.tsx's exportQuery) — shared by both export routes
 * (xlsx + pdf) so they parse query params identically rather than each
 * re-deriving it. Mirrors inquiry-report-filters.ts's shape.
 */
export function priceRecordFiltersFromSearchParams(params: URLSearchParams): {
  filters: PriceRecordFilters;
  search?: string;
} {
  const status = params.get('status');
  const currency = params.get('currency');
  return {
    filters: {
      skuId: params.get('skuId') ?? undefined,
      customerId: params.get('customerId') ?? undefined,
      priceTypeId: params.get('priceTypeId') ?? undefined,
      status:
        status && (PRICE_STATUSES as readonly string[]).includes(status)
          ? (status as PriceStatus)
          : undefined,
      currency:
        currency && (CURRENCIES as readonly string[]).includes(currency)
          ? (currency as Currency)
          : undefined,
      effectiveFrom: params.get('effectiveFrom') ?? undefined,
      effectiveTo: params.get('effectiveTo') ?? undefined,
    },
    search: params.get('q') ?? undefined,
  };
}
