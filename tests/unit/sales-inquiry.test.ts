import { describe, it, expect } from 'vitest';
import {
  sellPrice,
  priceDifference,
  estimatedProfit,
  quotationValue,
  formatInquiryNo,
  summarizeInquiries,
  type InquiryForSummary,
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
