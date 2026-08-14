import { describe, it, expect } from 'vitest';
import {
  computeTotalPaid,
  computeDepositPaid,
  computeFinalPaid,
  computeBalanceDue,
  canRecordFinalPayment,
  wouldExceedSoTotal,
  type PaymentReceiptLike,
} from '@/lib/domain/payment-receipt';

const receipts: PaymentReceiptLike[] = [
  { amount: 300, receipt_type: 'deposit' },
  { amount: 200, receipt_type: 'final' },
  { amount: 150, receipt_type: 'final' },
];

describe('computeTotalPaid / computeDepositPaid / computeFinalPaid', () => {
  it('sums all receipts regardless of type', () => {
    expect(computeTotalPaid(receipts)).toBeCloseTo(650, 6);
  });

  it('sums only deposit-tagged receipts', () => {
    expect(computeDepositPaid(receipts)).toBeCloseTo(300, 6);
  });

  it('sums only final-tagged receipts', () => {
    expect(computeFinalPaid(receipts)).toBeCloseTo(350, 6);
  });

  it('returns 0 for an empty ledger', () => {
    expect(computeTotalPaid([])).toBe(0);
    expect(computeDepositPaid([])).toBe(0);
    expect(computeFinalPaid([])).toBe(0);
  });
});

describe('computeBalanceDue', () => {
  it('total minus paid', () => {
    expect(computeBalanceDue(1000, 650)).toBeCloseTo(350, 6);
  });

  it('never goes negative on an overpayment-shaped input', () => {
    expect(computeBalanceDue(1000, 1200)).toBe(0);
  });

  it('is zero once fully paid', () => {
    expect(computeBalanceDue(1000, 1000)).toBe(0);
  });
});

describe('canRecordFinalPayment', () => {
  it('blocks until the deposit invoice is paid', () => {
    expect(canRecordFinalPayment('pending_deposit', 700)).toBe(false);
    expect(canRecordFinalPayment('partially_paid', 700)).toBe(false);
    expect(canRecordFinalPayment('void', 700)).toBe(false);
  });

  it('allows once the deposit is paid and a balance remains', () => {
    expect(canRecordFinalPayment('paid', 700)).toBe(true);
  });

  it('blocks once the balance reaches zero, even if the deposit is paid', () => {
    expect(canRecordFinalPayment('paid', 0)).toBe(false);
  });
});

describe('wouldExceedSoTotal', () => {
  it('false when the new payment stays within the SO total', () => {
    expect(wouldExceedSoTotal(1000, 700, 300)).toBe(false);
  });

  it('false exactly at the SO total (fully settles it)', () => {
    expect(wouldExceedSoTotal(1000, 700, 300.0)).toBe(false);
    expect(wouldExceedSoTotal(1000, 1000, 0.005)).toBe(false); // within rounding tolerance
  });

  it('true when the new payment would push collected past the SO total', () => {
    expect(wouldExceedSoTotal(1000, 700, 300.5)).toBe(true);
    expect(wouldExceedSoTotal(1000, 1000, 1)).toBe(true);
  });
});
