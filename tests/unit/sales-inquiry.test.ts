import { describe, it, expect } from 'vitest';
import {
  sellPrice,
  priceDifference,
  estimatedProfit,
  quotationValue,
  formatInquiryNo,
  summarizeInquiries,
  filterInquiries,
  type InquiryForSummary,
  type InquiryFilterable,
} from '@/lib/domain/sales-inquiry';
import { inquirySchema } from '@/lib/validation/schemas';

describe('inquiry calculations (match the workbook formulas)', () => {
  it('sell price = final if set, else quoted', () => {
    expect(sellPrice(1.8, 1.7)).toBe(1.7);
    expect(sellPrice(1.8, null)).toBe(1.8);
    expect(sellPrice(null, null)).toBeNull();
  });

  it('price difference = quoted − target; missing side counts as 0; both missing → null', () => {
    expect(priceDifference(1.8, 1.5)).toBeCloseTo(0.3, 6);
    expect(priceDifference(1.8, null)).toBe(1.8);
    expect(priceDifference(null, 1.5)).toBe(-1.5);
    expect(priceDifference(null, null)).toBeNull();
  });

  it('estimated profit = (sell − cost) × area × qty; null when cost/area/qty missing', () => {
    // (1.83 − 1.50) × 3 × 100 = 99
    expect(
      estimatedProfit({
        factoryCost: 1.5,
        quotedPrice: 1.83,
        targetPrice: null,
        finalPrice: null,
        areaPerSheet: 3,
        quantity: 100,
      }),
    ).toBeCloseTo(99, 6);

    // final price overrides quoted: (1.7 − 1.5) × 2 × 10 = 4
    expect(
      estimatedProfit({
        factoryCost: 1.5,
        quotedPrice: 1.83,
        targetPrice: null,
        finalPrice: 1.7,
        areaPerSheet: 2,
        quantity: 10,
      }),
    ).toBeCloseTo(4, 6);

    expect(
      estimatedProfit({
        factoryCost: null,
        quotedPrice: 1.83,
        targetPrice: null,
        finalPrice: null,
        areaPerSheet: 3,
        quantity: 100,
      }),
    ).toBeNull();
  });

  it('quotation value = quoted × area × qty (null when any input missing)', () => {
    expect(
      quotationValue({
        factoryCost: null,
        quotedPrice: 1.25,
        targetPrice: null,
        finalPrice: null,
        areaPerSheet: 4,
        quantity: 234,
      }),
    ).toBeCloseTo(1170, 6);
    expect(
      quotationValue({
        factoryCost: null,
        quotedPrice: null,
        targetPrice: null,
        finalPrice: null,
        areaPerSheet: 4,
        quantity: 234,
      }),
    ).toBeNull();
  });

  it('formats the inquiry number as ZY-YYYY-###', () => {
    expect(formatInquiryNo(2026, 1)).toBe('ZY-2026-001');
    expect(formatInquiryNo(2026, 42)).toBe('ZY-2026-042');
    expect(formatInquiryNo(2026, 123)).toBe('ZY-2026-123');
  });
});

describe('dashboard summary', () => {
  const row = (o: Partial<InquiryForSummary>): InquiryForSummary => ({
    factoryCost: null,
    quotedPrice: null,
    targetPrice: null,
    finalPrice: null,
    areaPerSheet: null,
    quantity: null,
    statusCategory: null,
    familyId: null,
    salespersonId: null,
    ...o,
  });

  it('aggregates KPIs, conversion, profit, and breakdowns', () => {
    const s = summarizeInquiries([
      row({
        quotedPrice: 2,
        areaPerSheet: 5,
        quantity: 10,
        factoryCost: 1,
        statusCategory: 'won',
        familyId: 'mesh',
        salespersonId: 'ash',
      }), // qv=100, profit=(2-1)*5*10=50
      row({ statusCategory: 'lost', familyId: 'mesh', salespersonId: 'ash' }),
      row({ statusCategory: 'open', familyId: 'coil', salespersonId: 'ash' }),
      row({ statusCategory: null }), // no status → pending
    ]);

    expect(s.totalInquiries).toBe(4);
    expect(s.totalQuotationValue).toBeCloseTo(100, 6);
    expect(s.wonOrders).toBe(1);
    expect(s.lostOrders).toBe(1);
    expect(s.conversionRate).toBeCloseTo(0.5, 6); // 1 / (1+1)
    expect(s.wonProfit).toBeCloseTo(50, 6);
    expect(s.pendingFollowups).toBe(2); // open + unset
    expect(s.byCategory).toEqual({ open: 1, won: 1, lost: 1 });
    expect(s.topProducts[0]).toEqual({ familyId: 'mesh', inquiries: 2, quantity: 10 });
    expect(s.salespeople[0]).toEqual({ salespersonId: 'ash', inquiries: 3 });
  });

  it('conversion rate is 0 when nothing is decided', () => {
    const s = summarizeInquiries([row({ statusCategory: 'open' })]);
    expect(s.conversionRate).toBe(0);
  });
});

describe('filterInquiries (backs both the on-screen table and the export routes)', () => {
  const row = (o: Partial<InquiryFilterable>): InquiryFilterable => ({
    status_id: null,
    customer_type_id: null,
    salesperson_id: null,
    family_id: null,
    inquiry_date: '2026-01-01',
    customer_name: 'Galleria Tile',
    company_name: null,
    inquiry_no: 'ZY-2026-001',
    ...o,
  });

  it('returns every row when no filter is set', () => {
    const rows = [row({}), row({ inquiry_no: 'ZY-2026-002' })];
    expect(filterInquiries(rows, {})).toHaveLength(2);
  });

  it('narrows by status, customer type, salesperson, and product independently', () => {
    const rows = [
      row({ status_id: 'won', customer_type_id: 'a', salesperson_id: 'ash', family_id: 'mesh' }),
      row({ status_id: 'lost', customer_type_id: 'b', salesperson_id: 'sam', family_id: 'coil' }),
    ];
    expect(filterInquiries(rows, { status: 'won' })).toHaveLength(1);
    expect(filterInquiries(rows, { customerType: 'b' })).toHaveLength(1);
    expect(filterInquiries(rows, { salesperson: 'ash' })).toHaveLength(1);
    expect(filterInquiries(rows, { product: 'coil' })[0]?.status_id).toBe('lost');
  });

  it('narrows by inquiry_date as an inclusive [dateFrom, dateTo] range', () => {
    const rows = [
      row({ inquiry_date: '2026-01-10' }),
      row({ inquiry_date: '2026-02-15' }),
      row({ inquiry_date: '2026-03-20' }),
    ];
    expect(filterInquiries(rows, { dateFrom: '2026-02-01' })).toHaveLength(2);
    expect(filterInquiries(rows, { dateTo: '2026-02-01' })).toHaveLength(1);
    expect(filterInquiries(rows, { dateFrom: '2026-01-10', dateTo: '2026-01-10' })).toHaveLength(1);
  });

  it('search matches customer name, company name, or inquiry number, case-insensitively', () => {
    const rows = [
      row({ customer_name: 'Galleria Tile', company_name: 'Galleria Co', inquiry_no: 'ZY-1' }),
      row({ customer_name: 'Other Customer', company_name: null, inquiry_no: 'ZY-2' }),
    ];
    expect(filterInquiries(rows, { search: 'galleria' })).toHaveLength(1);
    expect(filterInquiries(rows, { search: 'ZY-2' })).toHaveLength(1);
    expect(filterInquiries(rows, { search: 'nobody' })).toHaveLength(0);
  });

  it('combines every filter with AND', () => {
    const rows = [
      row({ status_id: 'won', inquiry_date: '2026-01-05', customer_name: 'Match Me' }),
      row({ status_id: 'won', inquiry_date: '2026-06-05', customer_name: 'Match Me' }),
    ];
    expect(
      filterInquiries(rows, { status: 'won', dateFrom: '2026-01-01', dateTo: '2026-02-01' }),
    ).toHaveLength(1);
  });
});

describe('inquiry schema', () => {
  it('requires only the customer name', () => {
    expect(inquirySchema.safeParse({ customerName: 'Galleria Tile' }).success).toBe(true);
    expect(inquirySchema.safeParse({ customerName: '' }).success).toBe(false);
  });

  it('coerces numeric fields and treats blanks as undefined', () => {
    const r = inquirySchema.safeParse({
      customerName: 'X',
      quotedPrice: '1.83',
      areaPerSheet: '',
      quantity: '489',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.quotedPrice).toBeCloseTo(1.83, 6);
      expect(r.data.areaPerSheet).toBeUndefined();
      expect(r.data.quantity).toBe(489);
    }
  });
});
