/**
 * Payment Receipts — pure, no-I/O business rules.
 *
 * The payment_receipts ledger (0030_payment_receipts.sql) is no longer
 * written to by the app — Sales Order payments are now simple deposit/balance
 * paid flags (0037_so_deposit_balance_paid.sql), the same posture quotations
 * already use. This file is trimmed to just what the historical
 * payment-receipt PDF route (/api/export/payment-receipt/[id]/pdf) still
 * needs to render receipts issued before that change.
 */

export const PAYMENT_RECEIPT_TYPES = ['deposit', 'final'] as const;
export type PaymentReceiptType = (typeof PAYMENT_RECEIPT_TYPES)[number];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Balance due = total order amount − everything collected so far (never negative). */
export function computeBalanceDue(totalOrderAmount: number, totalPaid: number): number {
  return Math.max(0, round2(totalOrderAmount - totalPaid));
}
