/**
 * Branded Payment Receipt — pure, no DOM / no server deps.
 *
 * Self-contained HTML string, rendered to a real PDF server-side by pdf.ts
 * (see /api/export/payment-receipt/[id]/pdf) — same pattern as
 * deposit-invoice-html.ts. One receipt document per payment_receipts row;
 * the heading and colour accent switch on receiptType so a Deposit Receipt
 * and a Final Payment Receipt are never visually ambiguous.
 */
import { esc } from './inquiry-report-html';
import type { PaymentReceiptType } from '@/lib/domain/payment-receipt';

export interface PaymentReceiptData {
  receiptNumber: string;
  receiptType: PaymentReceiptType;
  paidDate: string; // dd/mm/yyyy
  currency: string;
  amount: number;
  method: string | null;
  notes: string | null;
  customer: {
    name: string;
    contactPerson: string | null;
    phone: string | null;
    address: string | null;
  };
  so: {
    soNumber: string;
    orderDate: string; // dd/mm/yyyy
  };
  totalOrderAmount: number;
  totalPaidToDate: number; // includes this receipt's amount
  balanceRemaining: number; // after this receipt
  recordedBy: string | null;
}

function formatMoney(n: number, currency: string): string {
  return `${currency} ${n.toFixed(2)}`;
}

const RED = '#e31e24';
const HEADER_RED = '#b3141a';
const GREY = '#ededed';
const BANNER = '#fbf2f2';
const MUTED = '#6b6b6b';
const INK = '#1a1a1a';

const RECEIPT_TYPE_BAR: Record<PaymentReceiptType, string> = {
  deposit: 'DEPOSIT RECEIPT · 定金收据',
  final: 'FINAL PAYMENT RECEIPT · 尾款收据',
};

/** A self-contained, print-optimized HTML document for one payment receipt. */
export function buildPaymentReceiptHtml(data: PaymentReceiptData): string {
  const summaryRow = (label: string, value: string, emphasise = false) => `
    <div class="summary-row${emphasise ? ' emphasise' : ''}">
      <span>${esc(label)}</span><span>${esc(value)}</span>
    </div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ZY Steel · ${esc(RECEIPT_TYPE_BAR[data.receiptType])} ${esc(data.receiptNumber)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    color: ${INK};
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    padding: 22px;
  }
  .letterhead { display: flex; align-items: center; gap: 12px; }
  .logo { height: 46px; width: auto; }
  .brand { font-size: 24px; font-weight: 700; letter-spacing: .2px; }
  .sub { font-size: 10.5px; color: ${MUTED}; margin-top: 2px; }
  .bar {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 8px; margin: 14px 0; font-size: 14px; letter-spacing: .3px;
  }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 11px; margin-bottom: 14px; }
  .meta-grid .label { font-size: 9px; color: ${MUTED}; text-transform: uppercase; font-weight: 700; }
  .amount-box {
    border: 1px solid ${GREY}; border-left: 4px solid ${RED}; padding: 14px 18px;
    margin-bottom: 14px; text-align: center;
  }
  .amount-box .label { font-size: 9px; color: ${MUTED}; text-transform: uppercase; font-weight: 700; }
  .amount-box .value { font-size: 26px; font-weight: 700; color: ${HEADER_RED}; margin-top: 4px; }
  .summary { border: 1px solid ${GREY}; padding: 10px 14px; max-width: 320px; margin-left: auto; }
  .summary-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; }
  .summary-row.emphasise { font-size: 13px; font-weight: 700; border-top: 1px solid ${GREY}; margin-top: 4px; padding-top: 8px; }
  .status { display: inline-block; margin-top: 8px; padding: 3px 10px; background: ${BANNER}; border: 1px solid ${RED}; color: ${HEADER_RED}; font-weight: 700; font-size: 10px; }
  .notes { margin-top: 14px; font-size: 10px; color: ${MUTED}; }
  .footer {
    background: ${RED}; color: #fff; font-weight: 700; text-align: center;
    padding: 6px; margin-top: 14px; font-size: 9px;
  }
  @page { size: A4 portrait; margin: 12mm; }
</style>
</head>
<body>
  <div class="letterhead">
    <img src="/brand/zysteel-logo.png" alt="ZY Steel 中粤铁网" class="logo" />
    <div>
      <div class="brand">ZY STEEL&nbsp;&nbsp;中粤铁网</div>
      <div class="sub">Steel Mesh &amp; Wire Drawing Manufacturer&nbsp;·&nbsp;Phnom Penh, Cambodia</div>
    </div>
  </div>
  <div class="bar">${esc(RECEIPT_TYPE_BAR[data.receiptType])}</div>

  <div class="meta-grid">
    <div>
      <div class="label">Received From 客户</div>
      <div><strong>${esc(data.customer.name)}</strong></div>
      ${data.customer.contactPerson ? `<div>${esc(data.customer.contactPerson)}</div>` : ''}
      ${data.customer.phone ? `<div>Tel: ${esc(data.customer.phone)}</div>` : ''}
      ${data.customer.address ? `<div>${esc(data.customer.address)}</div>` : ''}
    </div>
    <div>
      <div><span class="label">Receipt No.: </span>${esc(data.receiptNumber)}</div>
      <div><span class="label">Date: </span>${esc(data.paidDate)}</div>
      <div><span class="label">Sales Order Ref.: </span>${esc(data.so.soNumber)} (${esc(data.so.orderDate)})</div>
      <div><span class="label">Method: </span>${esc(data.method || '—')}</div>
      ${data.recordedBy ? `<div><span class="label">Recorded by: </span>${esc(data.recordedBy)}</div>` : ''}
    </div>
  </div>

  <div class="amount-box">
    <div class="label">Amount Received 实收金额</div>
    <div class="value">${esc(formatMoney(data.amount, data.currency))}</div>
  </div>

  <div class="summary">
    ${summaryRow('Total Order Amount', formatMoney(data.totalOrderAmount, data.currency))}
    ${summaryRow('Total Paid To Date', formatMoney(data.totalPaidToDate, data.currency))}
    ${summaryRow('Balance Remaining', formatMoney(data.balanceRemaining, data.currency), true)}
  </div>

  ${data.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(data.notes)}</div>` : ''}

  <div class="footer">ZY STEEL 中粤铁网 &middot; Phnom Penh, Cambodia &middot; Thank you for your business</div>
</body>
</html>`;
}
