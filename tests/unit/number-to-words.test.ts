import { describe, it, expect } from 'vitest';
import { integerToWords, amountInWords } from '@/lib/domain/number-to-words';

describe('integerToWords', () => {
  it('handles zero and small numbers', () => {
    expect(integerToWords(0)).toBe('Zero');
    expect(integerToWords(7)).toBe('Seven');
    expect(integerToWords(19)).toBe('Nineteen');
  });

  it('handles tens with and without a trailing ones digit', () => {
    expect(integerToWords(20)).toBe('Twenty');
    expect(integerToWords(21)).toBe('Twenty-One');
    expect(integerToWords(99)).toBe('Ninety-Nine');
  });

  it('handles hundreds', () => {
    expect(integerToWords(100)).toBe('One Hundred');
    expect(integerToWords(105)).toBe('One Hundred Five');
    expect(integerToWords(999)).toBe('Nine Hundred Ninety-Nine');
  });

  it('handles thousands/millions with zero-groups skipped', () => {
    expect(integerToWords(1000)).toBe('One Thousand');
    expect(integerToWords(10000)).toBe('Ten Thousand');
    // 1,000,001 -> no "Thousand" group since it's zero, only Million + One.
    expect(integerToWords(1000001)).toBe('One Million One');
    expect(integerToWords(1234567)).toBe(
      'One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven',
    );
  });
});

describe('amountInWords (the invoice "Amount in Words" line)', () => {
  it('matches the spec example exactly: $10,000 -> "Ten Thousand US Dollars Only"', () => {
    expect(amountInWords(10000, 'USD')).toBe('Ten Thousand US Dollars Only');
  });

  it('adds the cents clause only when there are cents', () => {
    expect(amountInWords(10000.5, 'USD')).toBe('Ten Thousand US Dollars and Fifty Cents Only');
    expect(amountInWords(10000.05, 'USD')).toBe('Ten Thousand US Dollars and Five Cents Only');
    expect(amountInWords(10000.0, 'USD')).toBe('Ten Thousand US Dollars Only');
  });

  it('uses the right unit names per currency', () => {
    expect(amountInWords(500, 'KHR')).toBe('Five Hundred Riel Only');
    expect(amountInWords(500, 'CNY')).toBe('Five Hundred RMB Only');
  });

  it('falls back to the currency code for an unknown currency', () => {
    expect(amountInWords(10, 'EUR')).toBe('Ten EUR Only');
  });

  it('is not thrown off by float noise (e.g. 0.1 + 0.2 style errors)', () => {
    // 11000 built from 10000 + 1000 (subtotal + VAT) is exact, but guard
    // against the general case since money math elsewhere in this app can
    // produce values like 7905.599999999999.
    expect(amountInWords(7905.6, 'USD')).toBe(
      'Seven Thousand Nine Hundred Five US Dollars and Sixty Cents Only',
    );
  });
});
