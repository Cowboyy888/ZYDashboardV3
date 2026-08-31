import type { InquiryFilters } from '@/lib/domain/sales-inquiry';

/**
 * Reads the same filter params the Inquiries tab puts on its download links
 * (inquiries-client.tsx's exportQuery) — shared by both export routes
 * (xlsx + pdf) so they parse query params identically rather than each
 * re-deriving it.
 */
export function inquiryFiltersFromSearchParams(params: URLSearchParams): InquiryFilters {
  return {
    status: params.get('status') ?? undefined,
    customerType: params.get('customerType') ?? undefined,
    salesperson: params.get('salesperson') ?? undefined,
    product: params.get('product') ?? undefined,
    dateFrom: params.get('dateFrom') ?? undefined,
    dateTo: params.get('dateTo') ?? undefined,
    search: params.get('q') ?? undefined,
  };
}
