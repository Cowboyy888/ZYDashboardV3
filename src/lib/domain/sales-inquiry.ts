/**
 * Customer price-inquiry domain logic — pure, no I/O, fully unit-testable.
 *
 * Mirrors the auto-calculated ("grey") columns and the dashboard of the
 * 客户询价报告 workbook. All prices are per square metre ($/m²).
 *
 *   - Sell price      = final negotiated price if set, else the quoted price.
 *   - Price difference = quoted − customer target ($/m²).
 *   - Estimated profit = (sell − factory cost) × area per sheet × quantity.
 *   - Quotation value  = quoted × area per sheet × quantity.
 *
 * These match the spreadsheet formulas; the DB stores the same values as
 * GENERATED columns, and the UI recomputes them live as the user types.
 */

export type StatusCategory = 'open' | 'won' | 'lost';

/** Numeric inputs for one inquiry row (nulls model empty spreadsheet cells). */
export interface InquiryNumbers {
  factoryCost: number | null;
  quotedPrice: number | null;
  targetPrice: number | null;
  finalPrice: number | null;
  areaPerSheet: number | null;
  quantity: number | null;
}

const has = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Sell price = final if negotiated, otherwise quoted (null if neither set). */
export function sellPrice(quoted: number | null, final: number | null): number | null {
  if (has(final)) return final;
  if (has(quoted)) return quoted;
  return null;
}

/**
 * Quoted − target ($/m²). Null only when BOTH are missing; otherwise a missing
 * side counts as 0 (matches the sheet's `IF(AND(Q="",R=""),"",N(Q)-N(R))`).
 */
export function priceDifference(quoted: number | null, target: number | null): number | null {
  if (!has(quoted) && !has(target)) return null;
  return (has(quoted) ? quoted : 0) - (has(target) ? target : 0);
}

/**
 * (sell − cost) × area × qty. Null when cost, area, or quantity is missing
 * (matches `IF(OR(P="",L="",N=""),"",…)`). A missing sell price counts as 0.
 */
export function estimatedProfit(n: InquiryNumbers): number | null {
  if (!has(n.factoryCost) || !has(n.areaPerSheet) || !has(n.quantity)) return null;
  const sell = sellPrice(n.quotedPrice, n.finalPrice) ?? 0;
  return (sell - n.factoryCost) * n.areaPerSheet * n.quantity;
}

/** Quoted × area × qty. Null when any input is missing. */
export function quotationValue(n: InquiryNumbers): number | null {
  if (!has(n.quotedPrice) || !has(n.areaPerSheet) || !has(n.quantity)) return null;
  return n.quotedPrice * n.areaPerSheet * n.quantity;
}

/** Inquiry number, e.g. formatInquiryNo(2026, 1) === 'ZY-2026-001'. */
export function formatInquiryNo(year: number, seq: number): string {
  return `ZY-${year}-${String(seq).padStart(3, '0')}`;
}

// --- Filtering ------------------------------------------------------------------

/** The fields a row needs for filterInquiries — deliberately narrower than the
 * full DB row so this stays reusable from both the client table and the
 * export routes without importing db/types.ts into the domain layer. */
export interface InquiryFilterable {
  status_id: string | null;
  customer_type_id: string | null;
  salesperson_id: string | null;
  family_id: string | null;
  inquiry_date: string; // ISO "YYYY-MM-DD"
  customer_name: string;
  company_name: string | null;
  inquiry_no: string | null;
}

export interface InquiryFilters {
  status?: string;
  customerType?: string;
  salesperson?: string;
  product?: string; // family_id
  dateFrom?: string; // ISO "YYYY-MM-DD"
  dateTo?: string;
  search?: string;
}

/**
 * The single filter predicate behind both the Inquiries tab's on-screen table
 * and its Excel/PDF export routes, so "download" always means "download what
 * you're looking at" — one rule, not two copies that can drift apart.
 */
export function filterInquiries<T extends InquiryFilterable>(
  rows: T[],
  filters: InquiryFilters,
): T[] {
  const q = filters.search?.trim().toLowerCase() ?? '';
  return rows.filter((i) => {
    if (filters.status && i.status_id !== filters.status) return false;
    if (filters.customerType && i.customer_type_id !== filters.customerType) return false;
    if (filters.salesperson && i.salesperson_id !== filters.salesperson) return false;
    if (filters.product && i.family_id !== filters.product) return false;
    // inquiry_date is an ISO "YYYY-MM-DD" string — plain string comparison
    // sorts the same as date order, no Date parsing needed.
    if (filters.dateFrom && i.inquiry_date < filters.dateFrom) return false;
    if (filters.dateTo && i.inquiry_date > filters.dateTo) return false;
    if (
      q &&
      !`${i.customer_name} ${i.company_name ?? ''} ${i.inquiry_no ?? ''}`.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
}

// --- Dashboard summary --------------------------------------------------------

/** Minimal shape the dashboard needs from each inquiry. */
export interface InquiryForSummary extends InquiryNumbers {
  statusCategory: StatusCategory | null;
  familyId: string | null;
  salespersonId: string | null;
}

export interface ProductRollup {
  familyId: string;
  inquiries: number;
  quantity: number;
}
export interface SalespersonRollup {
  salespersonId: string;
  inquiries: number;
}

export interface InquirySummary {
  totalInquiries: number;
  totalQuotationValue: number;
  wonOrders: number;
  lostOrders: number;
  /** won / (won + lost); 0 when there are no decided inquiries. */
  conversionRate: number;
  wonProfit: number;
  pendingFollowups: number;
  /** count per status category (open/won/lost). */
  byCategory: Record<StatusCategory, number>;
  topProducts: ProductRollup[];
  salespeople: SalespersonRollup[];
}

/**
 * Aggregate a set of inquiries into the dashboard KPIs. Pure: callers resolve
 * each row's status category (from the statuses list) before passing it in.
 */
export function summarizeInquiries(rows: InquiryForSummary[]): InquirySummary {
  const byCategory: Record<StatusCategory, number> = { open: 0, won: 0, lost: 0 };
  const products = new Map<string, ProductRollup>();
  const people = new Map<string, SalespersonRollup>();

  let totalQuotationValue = 0;
  let wonProfit = 0;
  let pendingFollowups = 0;

  for (const r of rows) {
    totalQuotationValue += quotationValue(r) ?? 0;

    const cat = r.statusCategory;
    if (cat) byCategory[cat] += 1;
    if (cat === 'won') wonProfit += estimatedProfit(r) ?? 0;
    if (cat !== 'won' && cat !== 'lost') pendingFollowups += 1; // open or unset

    if (r.familyId) {
      const p = products.get(r.familyId) ?? { familyId: r.familyId, inquiries: 0, quantity: 0 };
      p.inquiries += 1;
      p.quantity += has(r.quantity) ? r.quantity : 0;
      products.set(r.familyId, p);
    }
    if (r.salespersonId) {
      const s = people.get(r.salespersonId) ?? { salespersonId: r.salespersonId, inquiries: 0 };
      s.inquiries += 1;
      people.set(r.salespersonId, s);
    }
  }

  const decided = byCategory.won + byCategory.lost;
  return {
    totalInquiries: rows.length,
    totalQuotationValue,
    wonOrders: byCategory.won,
    lostOrders: byCategory.lost,
    conversionRate: decided > 0 ? byCategory.won / decided : 0,
    wonProfit,
    pendingFollowups,
    byCategory,
    topProducts: [...products.values()].sort((a, b) => b.inquiries - a.inquiries),
    salespeople: [...people.values()].sort((a, b) => b.inquiries - a.inquiries),
  };
}
