/**
 * Payment Receipts — pure, no-I/O business rules.
 *
 * A payment receipt is one entry in a Sales Order's append-only payment
 * ledger (see 0030_payment_receipts.sql): each records money actually
 * received, tagged 'deposit' or 'final', and gets its own unique
 * REC-YYYY-#### number. Totals here are always derived from the receipt
 * list, never stored — same "ledger, not totals" posture as
 * deposit-invoice.ts's amountPaid/status helpers.
 */
import type { DepositInvoiceStatus } from './deposit-invoice';

export const PAYMENT_RECEIPT_TYPES = ['deposit', 'final'] as const;
export type PaymentReceiptType = (typeof PAYMENT_RECEIPT_TYPES)[number];

export const PAYMENT_RECEIPT_TYPE_LABELS: Record<PaymentReceiptType, { en: string; zh: string }> = {
  deposit: { en: 'Deposit Receipt', zh: '定金收据' },
  final: { en: 'Final Payment Receipt', zh: '尾款收据' },
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PaymentReceiptLike {
  amount: number;
  receipt_type: PaymentReceiptType;
}

/** Total collected so far across every receipt (deposit + final) for a SO. */
export function computeTotalPaid(receipts: PaymentReceiptLike[]): number {
  return round2(receipts.reduce((sum, r) => sum + r.amount, 0));
}

/** Total collected via deposit-tagged receipts only. */
export function computeDepositPaid(receipts: PaymentReceiptLike[]): number {
  return round2(
    receipts.filter((r) => r.receipt_type === 'deposit').reduce((sum, r) => sum + r.amount, 0),
  );
}

/** Total collected via final-payment-tagged receipts only. */
export function computeFinalPaid(receipts: PaymentReceiptLike[]): number {
  return round2(
    receipts.filter((r) => r.receipt_type === 'final').reduce((sum, r) => sum + r.amount, 0),
  );
}

/** Balance due = total order amount − everything collected so far (never negative). */
export function computeBalanceDue(totalOrderAmount: number, totalPaid: number): number {
  return Math.max(0, round2(totalOrderAmount - totalPaid));
}

/**
 * A final payment may only be recorded once the deposit invoice has reached
 * 'paid' AND there is still a balance left to collect — allows any number of
 * partial final payments, same multi-entry ledger posture as deposit
 * payments (canRecordPayment in deposit-invoice.ts).
 */
export function canRecordFinalPayment(
  depositInvoiceStatus: DepositInvoiceStatus,
  balanceDue: number,
): boolean {
  return depositInvoiceStatus === 'paid' && balanceDue > 0;
}

/**
 * Pure mirror of enforce_payment_receipt_rules()'s guard in
 * 0030_payment_receipts.sql — used for a friendly client-side check before
 * submit. The DB trigger remains the authoritative source of truth.
 */
export function wouldExceedSoTotal(
  totalOrderAmount: number,
  alreadyPaid: number,
  newAmount: number,
): boolean {
  return round2(alreadyPaid + newAmount) > round2(totalOrderAmount) + 0.01;
}
