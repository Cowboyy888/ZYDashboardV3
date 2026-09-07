import { describe, it, expect } from 'vitest';
import {
  resolveCurrentPrice,
  isExpired,
  isEffective,
  daysUntilExpiry,
  type PriceRecordLike,
} from '@/lib/domain/price-records';

const record = (o: Partial<PriceRecordLike> = {}): PriceRecordLike => ({
  id: 'r1',
  skuId: 'sku-1',
  customerId: null,
  priceTypeName: 'Standard Price',
  price: 5.0,
  effectiveDate: '2026-01-01',
  expiryDate: null,
  status: 'active',
  ...o,
});

describe('isExpired / isEffective', () => {
  it('a record with no expiry date never expires', () => {
    expect(isExpired(record({ expiryDate: null }), '2099-01-01')).toBe(false);
  });
  it('expired once expiry_date is strictly before today', () => {
    expect(isExpired(record({ expiryDate: '2026-06-01' }), '2026-06-01')).toBe(false); // last valid day
    expect(isExpired(record({ expiryDate: '2026-06-01' }), '2026-06-02')).toBe(true);
  });
  it('not effective until the effective date arrives', () => {
    expect(isEffective(record({ effectiveDate: '2026-06-01' }), '2026-05-31')).toBe(false);
    expect(isEffective(record({ effectiveDate: '2026-06-01' }), '2026-06-01')).toBe(true);
  });
});

describe('daysUntilExpiry', () => {
  it('null when the record never expires', () => {
    expect(daysUntilExpiry(record({ expiryDate: null }), '2026-06-01')).toBeNull();
  });
  it('counts forward and negative once past', () => {
    expect(daysUntilExpiry(record({ expiryDate: '2026-06-08' }), '2026-06-01')).toBe(7);
    expect(daysUntilExpiry(record({ expiryDate: '2026-06-01' }), '2026-06-08')).toBe(-7);
  });
});

describe('resolveCurrentPrice — priority order (spec: customer > project > special > wholesale > promotional > standard)', () => {
  const today = '2026-06-15';

  it('returns null when nothing applies to this sku', () => {
    expect(
      resolveCurrentPrice([], { skuId: 'sku-1', customerId: null, asOfDate: today }),
    ).toBeNull();
  });

  it('a customer-specific active price beats a standard price for the same customer', () => {
    const records = [
      record({ id: 'standard', priceTypeName: 'Standard Price', customerId: null, price: 5.0 }),
      record({ id: 'customer', priceTypeName: 'Customer Price', customerId: 'cust-1', price: 5.6 }),
    ];
    const result = resolveCurrentPrice(records, {
      skuId: 'sku-1',
      customerId: 'cust-1',
      asOfDate: today,
    });
    expect(result?.id).toBe('customer');
  });

  it('falls back to standard when no price is scoped to this customer', () => {
    const records = [record({ id: 'standard', priceTypeName: 'Standard Price', customerId: null })];
    const result = resolveCurrentPrice(records, {
      skuId: 'sku-1',
      customerId: 'cust-1',
      asOfDate: today,
    });
    expect(result?.id).toBe('standard');
  });

  it('a customer price for a DIFFERENT customer never applies to this one', () => {
    const records = [
      record({ id: 'other-customer', priceTypeName: 'Customer Price', customerId: 'cust-2' }),
      record({ id: 'standard', priceTypeName: 'Standard Price', customerId: null }),
    ];
    const result = resolveCurrentPrice(records, {
      skuId: 'sku-1',
      customerId: 'cust-1',
      asOfDate: today,
    });
    expect(result?.id).toBe('standard');
  });

  it('full priority chain: project beats special beats wholesale beats promotional beats standard', () => {
    const base = { skuId: 'sku-1', customerId: 'cust-1' as string | null };
    const records = [
      record({ ...base, id: 'standard', priceTypeName: 'Standard Price', customerId: null }),
      record({ ...base, id: 'promo', priceTypeName: 'Promotional Price' }),
      record({ ...base, id: 'wholesale', priceTypeName: 'Wholesale Price' }),
      record({ ...base, id: 'special', priceTypeName: 'Special Price' }),
      record({ ...base, id: 'project', priceTypeName: 'Project Price' }),
    ];
    expect(resolveCurrentPrice(records, { ...base, asOfDate: today })?.id).toBe('project');
    expect(
      resolveCurrentPrice(
        records.filter((r) => r.id !== 'project'),
        { ...base, asOfDate: today },
      )?.id,
    ).toBe('special');
    expect(
      resolveCurrentPrice(
        records.filter((r) => !['project', 'special'].includes(r.id)),
        { ...base, asOfDate: today },
      )?.id,
    ).toBe('wholesale');
  });

  it('ignores expired, not-yet-effective, and cancelled/inactive records', () => {
    const records = [
      record({ id: 'expired', status: 'active', expiryDate: '2026-01-01' }),
      record({ id: 'future', status: 'active', effectiveDate: '2099-01-01' }),
      record({ id: 'cancelled', status: 'cancelled' }),
      record({ id: 'the-real-one', status: 'active', price: 6.0 }),
    ];
    const result = resolveCurrentPrice(records, {
      skuId: 'sku-1',
      customerId: null,
      asOfDate: today,
    });
    expect(result?.id).toBe('the-real-one');
  });

  it('only considers records for the requested sku', () => {
    const records = [
      record({ id: 'other-sku', skuId: 'sku-2' }),
      record({ id: 'this-sku', skuId: 'sku-1' }),
    ];
    const result = resolveCurrentPrice(records, {
      skuId: 'sku-1',
      customerId: null,
      asOfDate: today,
    });
    expect(result?.id).toBe('this-sku');
  });

  it('reproduces the spec Jan/Mar/Jun example: latest active row wins once earlier ones are superseded', () => {
    // createPriceRecord flips earlier rows to 'expired' when a new one is
    // created for the same context — by the time all three exist, only Jun
    // is still 'active', exactly like this.
    const records = [
      record({ id: 'jan', status: 'expired', effectiveDate: '2026-01-10', price: 5.2 }),
      record({ id: 'mar', status: 'expired', effectiveDate: '2026-03-01', price: 5.4 }),
      record({ id: 'jun', status: 'active', effectiveDate: '2026-06-01', price: 5.6 }),
    ];
    const result = resolveCurrentPrice(records, {
      skuId: 'sku-1',
      customerId: null,
      asOfDate: today,
    });
    expect(result?.id).toBe('jun');
    expect(result?.price).toBe(5.6);
  });
});
