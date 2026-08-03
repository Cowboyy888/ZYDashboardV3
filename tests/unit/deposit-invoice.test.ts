import { describe, it, expect } from 'vitest';
import {
  computeUnitPriceFromArea,
  computeDepositAmount,
  computeRemainingBalance,
  computeDepositInvoiceStatus,
  canGenerateDepositInvoice,
  canRecordPayment,
} from '@/lib/domain/deposit-invoice';

describe('computeUnitPriceFromArea', () => {
  it('price per sheet = price per m² × area per sheet', () => {
    expect(computeUnitPriceFromArea(1.8, 3)).toBeCloseTo(5.4, 6);
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

describe('canRecordPayment', () => {
  it('allows pending_deposit and partially_paid', () => {
    expect(canRecordPayment('pending_deposit')).toBe(true);
    expect(canRecordPayment('partially_paid')).toBe(true);
  });

  it('blocks paid and void', () => {
    expect(canRecordPayment('paid')).toBe(false);
    expect(canRecordPayment('void')).toBe(false);
  });
});
