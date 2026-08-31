import { describe, it, expect } from 'vitest';
import {
  buildQuotationDocHtml,
  documentTitle,
  defaultTerms,
  type QuotationDocData,
  type DocLine,
} from '@/lib/reports/quotation-doc-html';

const lines: DocLine[] = [
  {
    description: 'Welded Steel Mesh 钢网 (6 m × 2.4 m)',
    wireDia: '7.2 mm',
    steelGrade: 'Standard',
    unit: 'm²',
    unitPrice: 1.83,
    quantity: 4320,
  },
];

const base: QuotationDocData = {
  kind: 'quotation',
  docNo: 'ZYS-Q2607-001',
  issuedOn: '28/07/2026',
  issuedOnIso: '2026-07-28',
  customerName: 'ACT Trading',
  contact: null,
  projectSite: '50,000 Square meters',
  currency: 'USD',
  validDays: 15,
  depositPct: 0.3,
  lines,
};

const doc = (o: Partial<QuotationDocData> = {}) => buildQuotationDocHtml({ ...base, ...o });

describe('document titles', () => {
  it('names each document as the template does', () => {
    expect(documentTitle('quotation', 0.3)).toBe('OFFICIAL QUOTATION · 报价单');
    expect(documentTitle('deposit', 0.3)).toBe('DEPOSIT INVOICE (30%) · 30% 订金发票');
    expect(documentTitle('balance', 0.3)).toBe('BALANCE INVOICE (70%) · 70% 尾款发票');
  });

  it('reflects a different deposit share', () => {
    expect(documentTitle('deposit', 0.1)).toBe('DEPOSIT INVOICE (10%) · 10% 订金发票');
    expect(documentTitle('balance', 0.1)).toBe('BALANCE INVOICE (90%) · 90% 尾款发票');
  });
});

describe('shared branding', () => {
  it('every document carries the ZY Steel letterhead and footer', () => {
    for (const kind of ['quotation', 'deposit', 'balance'] as const) {
      const html = doc({ kind });
      expect(html.startsWith('<!doctype html>')).toBe(true);
      expect(html).toContain('ZY STEEL');
      expect(html).toContain('中粤铁网');
      expect(html).toContain('Steel Mesh &amp; Wire Drawing Manufacturer');
      expect(html).toContain('Thank you for your business');
      expect(html).toContain('print-color-adjust: exact');
      expect(html).toContain('Prepared &amp; Issued By');
      expect(html).toContain('Accepted By (Customer)');
    }
  });

  it('escapes customer-supplied text', () => {
    const html = doc({ customerName: 'A & B <Co>' });
    expect(html).toContain('A &amp; B &lt;Co&gt;');
    expect(html).not.toContain('<Co>');
  });
});

describe('quotation document', () => {
  it('shows QUOTATION TO, validity and the terms block', () => {
    const html = doc({ kind: 'quotation' });
    expect(html).toContain('QUOTATION TO:');
    expect(html).toContain('ZYS-Q2607-001');
    expect(html).toContain('Valid Until:');
    expect(html).toContain('2026-08-12'); // 28 Jul + 15 days
    expect(html).toContain('TERMS &amp; CONDITIONS');
    expect(html).toContain('Steel Grade');
  });

  it('uses the default six terms', () => {
    expect(defaultTerms(15)).toHaveLength(6);
    expect(defaultTerms(15)[2]).toContain('valid for 15 days');
  });
});

describe('deposit invoice', () => {
  const html = doc({ kind: 'deposit', docNo: 'ZYS-DP2607-001', refQuotationNo: 'ZYS-Q2607-001' });

  it('shows the invoice meta and references the quotation', () => {
    expect(html).toContain('INVOICE TO:');
    expect(html).toContain('Invoice No.:');
    expect(html).toContain('ZYS-DP2607-001');
    expect(html).toContain('Ref. Quotation:');
    expect(html).toContain('ZYS-Q2607-001');
  });

  it('never shows Ref. Deposit on the deposit invoice itself', () => {
    expect(html).not.toContain('Ref. Deposit:');
  });

  it('shows subtotal, deposit due and balance before delivery', () => {
    expect(html).toContain('Contract Subtotal:');
    expect(html).toContain('$7,905.60'); // 4,320 × 1.83
    expect(html).toContain('Deposit Due Now (30%):');
    expect(html).toContain('$2,371.68');
    expect(html).toContain('Balance Due Before Delivery:');
    expect(html).toContain('$5,533.92');
    expect(html).toContain('AMOUNT DUE NOW (30% DEPOSIT):');
  });

  it('lists payment instructions quoting its own number', () => {
    expect(html).toContain('PAYMENT INSTRUCTIONS');
    expect(html).toContain('Please quote Invoice No. ZYS-DP2607-001');
  });
});

describe('balance invoice', () => {
  const html = doc({
    kind: 'balance',
    docNo: 'ZYS-BL2607-001',
    refQuotationNo: 'ZYS-Q2607-001',
    refDepositNo: 'ZYS-DP2607-001',
  });

  it('shows Ref. Quotation and Ref. Deposit as two distinct references', () => {
    expect(html).toContain('Ref. Quotation:');
    expect(html).toContain('Ref. Deposit:');
    expect(html).toContain('ZYS-Q2607-001');
    expect(html).toContain('ZYS-DP2607-001');
  });

  it('offsets the deposit as a negative credit citing its invoice', () => {
    expect(html).toContain('Contract Subtotal:');
    expect(html).toContain('Less: 30% Deposit Paid (Inv ZYS-DP2607-001):');
    expect(html).toContain('-$2,371.68');
    expect(html).toContain('BALANCE DUE NOW (70%):');
    expect(html).toContain('$5,533.92');
    expect(html).toContain('AMOUNT DUE NOW (70% BALANCE):');
  });
});

describe("order number — distinct from this document's own invoice number", () => {
  it('shows Order No. on a deposit/balance invoice once a Sales Order exists', () => {
    const html = doc({ kind: 'balance', docNo: 'ZYS-BL2607-001', orderNo: 'ZYS-2026Y-006' });
    expect(html).toContain('Order No.:');
    expect(html).toContain('ZYS-2026Y-006');
    // Both numbers are present and distinguishable — the document's own
    // reference AND the order it belongs to, never conflated.
    expect(html).toContain('ZYS-BL2607-001');
  });

  it('omits Order No. when no Sales Order has been created yet', () => {
    const html = doc({ kind: 'deposit', docNo: 'ZYS-DP2607-001', orderNo: null });
    expect(html).not.toContain('Order No.:');
  });

  it('never shows Order No. on the plain quotation document', () => {
    const html = doc({ kind: 'quotation', orderNo: 'ZYS-2026Y-006' });
    expect(html).not.toContain('Order No.:');
  });
});

describe('empty state', () => {
  it('renders a placeholder row when there are no line items', () => {
    expect(doc({ lines: [] })).toContain('No line items');
  });
});

describe('VAT / invoice type (0043_invoice_vat.sql)', () => {
  it('non-VAT (default, no vatRegistered passed): shows VAT N/A, Commercial Invoice, no TIN', () => {
    const html = doc({ kind: 'deposit', docNo: 'ZYS-DP2607-001' });
    expect(html).toContain('VAT:');
    expect(html).toContain('N/A');
    expect(html).toContain('Invoice Type:');
    expect(html).toContain('COMMERCIAL INVOICE');
    expect(html).toContain('Not VAT Registered');
    expect(html).toContain('ZY Steel is currently not VAT registered');
    expect(html).not.toContain('TAX INVOICE');
    expect(html).not.toContain('VAT TIN');
    // The pre-existing deposit numbers are completely unaffected.
    expect(html).toContain('Deposit Due Now (30%):');
    expect(html).toContain('$2,371.68');
    expect(html).toContain('Grand Total:');
    expect(html).toContain('$7,905.60'); // grand total = subtotal when VAT is off
  });

  it('the quotation document shows Subtotal/VAT/Estimated Total too, but no Invoice Type label', () => {
    const html = doc({ kind: 'quotation' });
    expect(html).toContain('Subtotal:');
    expect(html).toContain('VAT:');
    expect(html).toContain('N/A');
    expect(html).toContain('Estimated Total:');
    expect(html).not.toContain('Invoice Type:');
    expect(html).not.toContain('COMMERCIAL INVOICE');
  });

  it('VAT registered at 10%: shows Tax Invoice, the VAT amount, TIN, and a grand-total-based deposit', () => {
    const html = doc({
      kind: 'deposit',
      docNo: 'ZYS-DP2607-001',
      vatRegistered: true,
      vatRate: 0.1,
      vatTin: 'K001-900123456',
    });
    expect(html).toContain('TAX INVOICE');
    expect(html).toContain('VAT Registered');
    expect(html).toContain('VAT TIN');
    expect(html).toContain('K001-900123456');
    expect(html).toContain('VAT (10%):');
    expect(html).toContain('$790.56'); // 10% of $7,905.60
    expect(html).toContain('Grand Total:');
    expect(html).toContain('$8,696.16'); // 7,905.60 + 790.56
    // Deposit is 30% of the GRAND TOTAL, not the pre-VAT subtotal.
    expect(html).toContain('Deposit Due Now (30%):');
    expect(html).toContain('$2,608.85'); // round2(8696.16 * 0.3)
    expect(html).not.toContain('ZY Steel is currently not VAT registered');
  });

  it('shows the Amount in Words line on invoices, matching the grand total', () => {
    const html = doc({ kind: 'deposit', docNo: 'ZYS-DP2607-001' });
    expect(html).toContain('Amount in Words:');
    expect(html).toContain('Seven Thousand Nine Hundred Five US Dollars and Sixty Cents Only');
  });

  it('does not show Amount in Words on the plain quotation', () => {
    expect(doc({ kind: 'quotation' })).not.toContain('Amount in Words:');
  });
});
