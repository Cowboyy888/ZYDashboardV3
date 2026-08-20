import { describe, it, expect } from 'vitest';
import {
  computeUnitPriceFromArea,
  computeOrderedQtyFromArea,
  computeDepositAmount,
  computeRemainingBalance,
  computeDepositInvoiceStatus,
  canGenerateDepositInvoice,
  computeSoPaymentStatus,
} from '@/lib/domain/deposit-invoice';

describe('computeUnitPriceFromArea', () => {
  it('price per sheet = price per m² × area per sheet', () => {
    expect(computeUnitPriceFromArea(1.8, 3)).toBeCloseTo(5.4, 6);
  });
});

describe('computeOrderedQtyFromArea', () => {
  it('sheet count = total area ÷ area per sheet', () => {
    // 5000 m² of 3m×6m (18 m²) sheets.
    expect(computeOrderedQtyFromArea(5000, 18)).toBeCloseTo(277.778, 3);
  });

  it('returns 0 when area per sheet is zero or missing', () => {
    expect(computeOrderedQtyFromArea(5000, 0)).toBe(0);
    expect(computeOrderedQtyFromArea(5000, -1)).toBe(0);
  });
});

describe('computeDepositAmount / computeRemainingBalance', () => {
  it('deposit = total × percentage; remaining = total − deposit', () => {
    expect(computeDepositAmount(1000, 30)).toBeCloseTo(300, 6);
    expect(computeRemainingBalance(1000, 300)).toBeCloseTo(700, 6);
  });

  it('handles a 100% deposit (remaining balance is zero)', () => {
    const deposit = computeDepositAmount(500, 100);
    expect(deposit).toBeCloseTo(500, 6);
    expect(computeRemainingBalance(500, deposit)).toBeCloseTo(0, 6);
  });
});

describe('computeDepositInvoiceStatus', () => {
  it('no payments → pending_deposit', () => {
    expect(computeDepositInvoiceStatus(300, 0)).toBe('pending_deposit');
  });

  it('partial payment → partially_paid', () => {
    expect(computeDepositInvoiceStatus(300, 150)).toBe('partially_paid');
  });

  it('payment meets or exceeds the deposit amount → paid', () => {
    expect(computeDepositInvoiceStatus(300, 300)).toBe('paid');
    expect(computeDepositInvoiceStatus(300, 350)).toBe('paid'); // overpayment still counts as paid
  });
});

describe('canGenerateDepositInvoice', () => {
  it('blocks draft and cancelled orders', () => {
    expect(canGenerateDepositInvoice('draft', false)).toBe(false);
    expect(canGenerateDepositInvoice('cancelled', false)).toBe(false);
  });

  it('allows confirmed/partially_delivered/delivered orders with no active invoice', () => {
    expect(canGenerateDepositInvoice('confirmed', false)).toBe(true);
    expect(canGenerateDepositInvoice('partially_delivered', false)).toBe(true);
    expect(canGenerateDepositInvoice('delivered', false)).toBe(true);
  });

  it('blocks when an active deposit invoice already exists', () => {
    expect(canGenerateDepositInvoice('confirmed', true)).toBe(false);
  });
});

describe('computeSoPaymentStatus', () => {
  it('none when no deposit invoice has been generated yet', () => {
    expect(computeSoPaymentStatus(false, null, null)).toBe('none');
  });

  it('pending_deposit once an invoice exists but nothing is marked paid', () => {
    expect(computeSoPaymentStatus(true, null, null)).toBe('pending_deposit');
  });

  it('partially_paid once the deposit is marked paid but not the balance', () => {
    expect(computeSoPaymentStatus(true, '2026-08-20', null)).toBe('partially_paid');
  });

  it('paid once both deposit and balance are marked paid', () => {
    expect(computeSoPaymentStatus(true, '2026-08-20', '2026-08-25')).toBe('paid');
  });
});
