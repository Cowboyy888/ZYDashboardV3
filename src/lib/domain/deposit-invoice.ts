/**
 * Deposit Invoice — pure, no-I/O business rules.
 *
 * A deposit invoice is generated off a confirmed Sales Order: it locks in the
 * order's total (sum of line totals) and a chosen deposit percentage.
 * deposit_amount/remaining_balance are GENERATED columns in the DB (see
 * 0020_deposit_invoices.sql) — the helpers below are pure mirrors of that same
 * arithmetic, used for live preview before submit and for unit tests.
 *
 * Payment status is never set directly by the app — it's derived from the
 * append-only deposit_invoice_payments ledger by a DB trigger.
 * `computeDepositInvoiceStatus` mirrors that trigger's logic so the UI and the
 * database never disagree about what the next status should be.
 */
import type { SoStatus } from './sales';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const DEPOSIT_PERCENTAGE_PRESETS = [10, 30, 50] as const;

export const DEPOSIT_INVOICE_STATUSES = [
  'pending_deposit',
  'partially_paid',
  'paid',
  'void',
] as const;
export type DepositInvoiceStatus = (typeof DEPOSIT_INVOICE_STATUSES)[number];

export const DEPOSIT_INVOICE_STATUS_LABELS: Record<
  DepositInvoiceStatus,
  { en: string; zh: string }
> = {
  pending_deposit: { en: 'Pending Deposit', zh: '待付定金' },
  partially_paid: { en: 'Partially Paid', zh: '部分付款' },
  paid: { en: 'Paid', zh: '已付款' },
  void: { en: 'Void', zh: '已作废' },
};

/**
 * Mirrored onto sales_orders.payment_status by a DB trigger whenever the
 * order's active deposit invoice status changes (0020_deposit_invoices.sql).
 * 'none' means no deposit invoice has been generated yet.
 */
export const SO_PAYMENT_STATUSES = ['none', 'pending_deposit', 'partially_paid', 'paid'] as const;
export type SoPaymentStatus = (typeof SO_PAYMENT_STATUSES)[number];

export const SO_PAYMENT_STATUS_LABELS: Record<SoPaymentStatus, { en: string; zh: string }> = {
  none: { en: 'No Deposit Invoice', zh: '未开定金发票' },
  pending_deposit: { en: 'Pending Deposit', zh: '待付定金' },
  partially_paid: { en: 'Partially Paid', zh: '部分付款' },
  paid: { en: 'Paid', zh: '已付款' },
};

/** Price per sheet = price per m² × area per sheet (the requested formula). */
export function computeUnitPriceFromArea(pricePerSqm: number, areaPerSheet: number): number {
  return round2(pricePerSqm * areaPerSheet);
}

/** Deposit amount = total order amount × deposit percentage. */
export function computeDepositAmount(totalOrderAmount: number, depositPercentage: number): number {
  return round2((totalOrderAmount * depositPercentage) / 100);
}

/** Remaining balance = total order amount − deposit amount. */
export function computeRemainingBalance(totalOrderAmount: number, depositAmount: number): number {
  return round2(totalOrderAmount - depositAmount);
}

/**
 * The status a deposit invoice should have given how much has been paid
 * against it so far — mirrors `recompute_deposit_invoice_status()` in
 * 0020_deposit_invoices.sql. Never returns 'void' (that's an explicit state,
 * not derived from payments).
 */
export function computeDepositInvoiceStatus(
  depositAmount: number,
  amountPaid: number,
): Exclude<DepositInvoiceStatus, 'void'> {
  if (amountPaid <= 0) return 'pending_deposit';
  if (amountPaid < depositAmount) return 'partially_paid';
  return 'paid';
}

/** A deposit invoice may only be generated for a confirmed, still-open SO with no active invoice yet. */
export function canGenerateDepositInvoice(soStatus: SoStatus, hasActiveInvoice: boolean): boolean {
  if (hasActiveInvoice) return false;
  return soStatus !== 'draft' && soStatus !== 'cancelled';
}

/** A payment may only be recorded while the invoice hasn't reached a terminal state. */
export function canRecordPayment(status: DepositInvoiceStatus): boolean {
  return status !== 'paid' && status !== 'void';
}
