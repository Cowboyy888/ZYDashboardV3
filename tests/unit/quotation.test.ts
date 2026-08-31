import { describe, it, expect } from 'vitest';
import {
  lineAmount,
  subtotal,
  depositDue,
  balanceDue,
  depositCredit,
  quotationTotals,
  normalizeDepositPct,
  depositPercentLabel,
  balancePercentLabel,
  formatDocNo,
  docPeriod,
  validUntil,
  isExpired,
  DOC_PREFIX,
  vatAmount,
  grandTotal,
  invoiceType,
  NO_VAT,
} from '@/lib/domain/quotation';

describe('workbook formulas — Amount / Subtotal / Deposit / Balance', () => {
  it('computes a line amount (F14 = D14 × E14)', () => {
    // Balance invoice sheet: 4,320 m² × $1.83 = $7,905.60 (matches the PDF).
    expect(lineAmount({ unitPrice: 1.83, quantity: 4320 })).toBe(7905.6);
    // Deposit sheet: 520 m² × $1.00 = $520.00
    expect(lineAmount({ unitPrice: 1, quantity: 520 })).toBe(520);
    expect(lineAmount({ unitPrice: null, quantity: 100 })).toBe(0);
  });

  it('sums lines into the contract subtotal (F16)', () => {
    expect(
      subtotal([
        { unitPrice: 1.83, quantity: 4320 },
        { unitPrice: 1.35, quantity: 100 },
      ]),
    ).toBe(8040.6);
    expect(subtotal([])).toBe(0);
  });

  it('reproduces the 30% deposit invoice from the PDF exactly', () => {
    const sub = 7905.6;
    expect(depositDue(sub, 0.3)).toBe(2371.68); // "Deposit Due Now (30%)"
    expect(balanceDue(sub, 0.3)).toBe(5533.92); // "Balance (70%) — due before delivery"
    // The two parts must always reconcile to the contract value.
    expect(depositDue(sub, 0.3) + balanceDue(sub, 0.3)).toBeCloseTo(sub, 2);
  });

  it('handles the 10% deposit used in the workbook sheet', () => {
    const sub = 520;
    expect(depositDue(sub, 0.1)).toBe(52);
    expect(balanceDue(sub, 0.1)).toBe(468);
  });

  it('shows the deposit as a negative credit on the balance invoice', () => {
    // Balance sheet: F17 = -F16 * C18
    expect(depositCredit(7905.6, 0.3)).toBe(-2371.68);
    // Subtotal + credit = balance due
    expect(7905.6 + depositCredit(7905.6, 0.3)).toBeCloseTo(balanceDue(7905.6, 0.3), 2);
  });

  it('normalises a deposit share given as a percentage or a fraction', () => {
    expect(normalizeDepositPct(0.3)).toBe(0.3);
    expect(normalizeDepositPct(30)).toBe(0.3); // forgiving input
    expect(normalizeDepositPct(-1)).toBe(0);
    expect(normalizeDepositPct(250)).toBe(1);
    expect(normalizeDepositPct(null)).toBe(0);
  });

  it('labels the deposit/balance split (C18 / C19 = 1 − C18)', () => {
    expect(depositPercentLabel(0.3)).toBe(30);
    expect(balancePercentLabel(0.3)).toBe(70);
    expect(depositPercentLabel(0.1)).toBe(10);
    expect(balancePercentLabel(0.1)).toBe(90);
  });

  it('keeps decimal percentages instead of rounding to a whole number', () => {
    // 41.4% deposit entered directly (normalizeDepositPct treats >1 as a percentage).
    expect(depositPercentLabel(41.4)).toBe(41.4);
    expect(balancePercentLabel(41.4)).toBe(58.6);
  });

  it("bundles every figure the three documents need — no VAT arg = today's exact numbers, unchanged", () => {
    const t = quotationTotals([{ unitPrice: 1.83, quantity: 4320 }], 0.3);
    expect(t).toEqual({
      subtotal: 7905.6,
      vatRegistered: false,
      vatRate: 0,
      vatAmount: 0,
      grandTotal: 7905.6,
      depositPct: 0.3,
      depositDue: 2371.68,
      balanceDue: 5533.92,
      depositPercent: 30,
      balancePercent: 70,
    });
  });
});

describe('VAT (Test 1/2/3 from the ZY Steel invoice spec)', () => {
  it('Test 1 — not VAT registered: VAT is N/A/0, grand total = subtotal', () => {
    expect(vatAmount(10000, NO_VAT)).toBe(0);
    expect(grandTotal(10000, NO_VAT)).toBe(10000);
    expect(invoiceType(false)).toBe('commercial');
  });

  it('Test 2 — VAT registered at 10%: VAT = $1,000, grand total = $11,000', () => {
    const vat = { registered: true, rate: 0.1 };
    expect(vatAmount(10000, vat)).toBe(1000);
    expect(grandTotal(10000, vat)).toBe(11000);
    expect(invoiceType(true)).toBe('tax');
  });

  it('Test 3 — deposit against the grand total: $10,000 grand total, $2,715 deposit -> $7,285 balance', () => {
    expect(depositDue(10000, 0.2715)).toBe(2715);
    expect(balanceDue(10000, 0.2715)).toBe(7285);
  });

  it('quotationTotals bases deposit/balance on GRAND TOTAL once VAT is on', () => {
    // $10,000 subtotal, 10% VAT -> $11,000 grand total, 30% deposit of THAT.
    const t = quotationTotals([{ unitPrice: 100, quantity: 100 }], 0.3, {
      registered: true,
      rate: 0.1,
    });
    expect(t.subtotal).toBe(10000);
    expect(t.vatAmount).toBe(1000);
    expect(t.grandTotal).toBe(11000);
    expect(t.depositDue).toBe(3300); // 30% of 11,000, not 10,000
    expect(t.balanceDue).toBe(7700);
    expect(t.depositDue + t.balanceDue).toBeCloseTo(t.grandTotal, 2);
  });

  it('a VAT-off quotation produces identical deposit/balance to before VAT existed', () => {
    const withoutArg = quotationTotals([{ unitPrice: 1.83, quantity: 4320 }], 0.3);
    const withNoVat = quotationTotals([{ unitPrice: 1.83, quantity: 4320 }], 0.3, NO_VAT);
    expect(withNoVat).toEqual(withoutArg);
  });
});

describe('document numbering', () => {
  it('uses the right prefix per document', () => {
    expect(DOC_PREFIX.quotation).toBe('Q');
    expect(DOC_PREFIX.deposit).toBe('DP');
    expect(DOC_PREFIX.balance).toBe('BL');
  });

  it('derives the YYMM period from the issue date', () => {
    expect(docPeriod('2026-07-30')).toBe('2607');
    expect(docPeriod('2026-08-03')).toBe('2608');
  });

  it('formats numbers exactly like the template', () => {
    expect(formatDocNo('quotation', '2026-07-30', 3)).toBe('ZYS-Q2607-003');
    expect(formatDocNo('deposit', '2026-08-01', 1)).toBe('ZYS-DP2608-001');
    expect(formatDocNo('balance', '2026-07-15', 1)).toBe('ZYS-BL2607-001');
    expect(formatDocNo('quotation', '2026-07-30', 123)).toBe('ZYS-Q2607-123');
  });
});

describe('quotation validity', () => {
  it('adds the validity window to the issue date', () => {
    expect(validUntil('2026-07-30', 15)).toBe('2026-08-14');
    expect(validUntil('2026-07-30', 0)).toBe('2026-07-30');
  });

  it('crosses month and year boundaries correctly', () => {
    expect(validUntil('2026-12-25', 10)).toBe('2027-01-04');
  });

  it('flags an expired quotation', () => {
    expect(isExpired('2026-07-30', 15, '2026-08-14')).toBe(false); // last valid day
    expect(isExpired('2026-07-30', 15, '2026-08-15')).toBe(true);
  });
});
