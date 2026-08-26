import { describe, it, expect } from 'vitest';
import {
  grossProfit,
  marginPct,
  bandRate,
  accrualPct,
  calculateCommission,
  totalCommission,
  isBelowMarginFloor,
  marginFloor,
  DEFAULT_COMMISSION_BANDS,
  PAYMENT_STATUS_LABELS,
} from '@/lib/domain/commission';

describe('gross profit and margin (workbook F and G)', () => {
  it('computes GP and margin from the sheet rows', () => {
    // SO-311: revenue 7,680, cost 6,288 → GP 1,392, margin 18.1%
    expect(grossProfit(7680, 6288)).toBe(1392);
    expect(marginPct(7680, 6288)).toBeCloseTo(0.18125, 5);
    // SO-322: 4,100 − 2,952 = 1,148 → 28%
    expect(grossProfit(4100, 2952)).toBe(1148);
    expect(marginPct(4100, 2952)).toBeCloseTo(0.28, 4);
  });

  it('never divides by zero revenue', () => {
    expect(marginPct(0, 500)).toBe(0);
    expect(marginPct(null, null)).toBe(0);
  });
});

describe('margin bands (workbook H)', () => {
  it('picks the first band the margin falls below', () => {
    expect(bandRate(0.05)).toBe(0); // under the 10% floor
    expect(bandRate(0.11)).toBe(0.05); // floor → 12%
    expect(bandRate(0.15)).toBe(0.08); // 12% → 18%
    expect(bandRate(0.2)).toBe(0.12); // 18% → 25%
    expect(bandRate(0.3)).toBe(0.15); // above 25%
  });

  it('treats a band limit as exclusive, matching the nested IF', () => {
    // margin exactly 0.12 is NOT "< 0.12", so it lands in the next band.
    expect(bandRate(0.12)).toBe(0.08);
    expect(bandRate(0.18)).toBe(0.12);
    expect(bandRate(0.25)).toBe(0.15);
    // Exactly at the floor earns nothing above zero rate.
    expect(bandRate(0.1)).toBe(0.05);
  });

  it('flags sales below the margin floor', () => {
    expect(marginFloor()).toBe(0.1);
    expect(isBelowMarginFloor(0.09)).toBe(true);
    expect(isBelowMarginFloor(0.1)).toBe(false);
  });

  it('honours custom bands', () => {
    const bands = [
      { upperMarginLimit: 0.2, rate: 0 },
      { upperMarginLimit: 1, rate: 0.2 },
    ];
    expect(bandRate(0.1, bands)).toBe(0);
    expect(bandRate(0.5, bands)).toBe(0.2);
    expect(marginFloor(bands)).toBe(0.2);
  });
});

describe('accrual by payment status (workbook J)', () => {
  it('pays in full only on collected revenue', () => {
    expect(accrualPct('paid_in_full')).toBe(1);
    expect(accrualPct('deposit_only')).toBe(0.5);
    expect(accrualPct('overdue_31_60')).toBe(0.5);
    expect(accrualPct('bad_debt')).toBe(0);
  });

  it('falls back to half for anything unrecognised (the sheet’s else branch)', () => {
    expect(accrualPct('other')).toBe(0.5);
    expect(accrualPct(null)).toBe(0.5);
  });

  it('labels every status bilingually', () => {
    expect(PAYMENT_STATUS_LABELS.paid_in_full.en).toBe('Paid in full');
    expect(PAYMENT_STATUS_LABELS.bad_debt.zh).toBe('坏账');
  });
});

describe('commission payable (workbook K = F × H × J)', () => {
  it('reproduces SO-311 — paid in full at 18.1% margin', () => {
    const r = calculateCommission({
      revenue: 7680,
      factoryCost: 6288,
      paymentStatus: 'paid_in_full',
    });
    expect(r.grossProfit).toBe(1392);
    expect(r.rate).toBe(0.12); // 18.125% → 18–25% band
    expect(r.accrual).toBe(1);
    expect(r.payable).toBeCloseTo(167.04, 2); // 1392 × 0.12 × 1
    expect(r.belowFloor).toBe(false);
  });

  it('halves the payout when only the deposit has been collected', () => {
    // SO-314: 9,600 − 8,640 = 960 → 10% margin → 5% band, deposit only.
    const r = calculateCommission({
      revenue: 9600,
      factoryCost: 8640,
      paymentStatus: 'deposit_only',
    });
    expect(r.grossProfit).toBe(960);
    expect(r.rate).toBe(0.05);
    expect(r.accrual).toBe(0.5);
    expect(r.payable).toBe(24); // 960 × 0.05 × 0.5
  });

  it('pays nothing on bad debt, however good the margin', () => {
    const r = calculateCommission({
      revenue: 4100,
      factoryCost: 2952,
      paymentStatus: 'bad_debt',
    });
    expect(r.rate).toBe(0.15); // 28% margin earns the top band…
    expect(r.payable).toBe(0); // …but nothing is collected
  });

  it('pays nothing below the margin floor and flags it', () => {
    const r = calculateCommission({
      revenue: 1000,
      factoryCost: 950,
      paymentStatus: 'paid_in_full',
    });
    expect(r.marginPct).toBeCloseTo(0.05, 4);
    expect(r.rate).toBe(0);
    expect(r.payable).toBe(0);
    expect(r.belowFloor).toBe(true);
  });
});

describe('period totals', () => {
  it('rolls entries up and counts below-floor sales', () => {
    const t = totalCommission([
      { revenue: 7680, factoryCost: 6288, paymentStatus: 'paid_in_full' },
      { revenue: 9600, factoryCost: 8640, paymentStatus: 'deposit_only' },
      { revenue: 1000, factoryCost: 950, paymentStatus: 'paid_in_full' }, // below floor
    ]);
    expect(t.entries).toBe(3);
    expect(t.revenue).toBe(18280);
    expect(t.grossProfit).toBe(2402); // 1392 + 960 + 50
    expect(t.payable).toBeCloseTo(191.04, 2); // 167.04 + 24 + 0
    expect(t.belowFloorCount).toBe(1);
  });

  it('handles an empty period', () => {
    expect(totalCommission([])).toEqual({
      entries: 0,
      revenue: 0,
      grossProfit: 0,
      payable: 0,
      belowFloorCount: 0,
    });
  });

  it('ships the workbook’s five bands by default', () => {
    expect(DEFAULT_COMMISSION_BANDS).toHaveLength(5);
    expect(DEFAULT_COMMISSION_BANDS.map((b) => b.rate)).toEqual([0, 0.05, 0.08, 0.12, 0.15]);
  });
});
