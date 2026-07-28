/**
 * Purchasing — pure, no-I/O business rules.
 *
 * Received/outstanding quantity is never stored; like stock itself it is
 * always derived from the ledger (see `purchase_order_item_received` view and
 * `buildPurchaseOrderRows` in ./purchasing-view.ts). Only `status` is a stored,
 * recomputed-on-receive field, mirrored here so the transition rule is
 * unit-testable independently of the database trigger that also enforces it.
 */
import { addDays, type BusinessDate } from './datetime';
import { round3 } from './stock-ledger';

export const CURRENCIES = ['USD', 'KHR', 'CNY'] as const;
export type Currency = (typeof CURRENCIES)[number];

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}

export const CURRENCY_LABELS: Record<Currency, { en: string; zh: string }> = {
  USD: { en: 'USD', zh: '美元' },
  KHR: { en: 'KHR', zh: '瑞尔' },
  CNY: { en: 'CNY', zh: '人民币' },
};

export const PO_STATUSES = [
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<PoStatus, { en: string; zh: string }> = {
  draft: { en: 'Draft', zh: '草稿' },
  ordered: { en: 'Ordered', zh: '已下单' },
  partially_received: { en: 'Partially Received', zh: '部分收货' },
  received: { en: 'Received', zh: '已收货' },
  cancelled: { en: 'Cancelled', zh: '已取消' },
};

/**
 * The status a PO should have given its total ordered vs. received quantity.
 * Only meaningful once the PO has been issued (never called for draft/cancelled
 * — those are explicit user transitions, not receipt-driven).
 */
export function computePoStatus(orderedTotal: number, receivedTotal: number): PoStatus {
  return round3(receivedTotal) >= round3(orderedTotal) ? 'received' : 'partially_received';
}

/** Outstanding = ordered − received (never negative in normal operation). */
export function computeOutstanding(orderedQty: number, receivedQty: number): number {
  return round3(orderedQty - receivedQty);
}

/**
 * Projected stock = physical stock on hand + outstanding ordered quantity not
 * yet received. Kept deliberately separate from physical stock everywhere in
 * the UI — this is a planning number, not a balance.
 */
export function computeProjectedStock(physicalStock: number, outstandingOrdered: number): number {
  return round3(physicalStock + Math.max(0, outstandingOrdered));
}

export interface OverReceiptGuardResult {
  ok: boolean;
  resultingReceived: number;
  blocked: boolean;
  reason?: string;
}

/**
 * Decide whether a proposed receipt may be posted against a PO item. Blocks
 * any receipt that would push total received above the ordered quantity,
 * UNLESS the actor is an Owner overriding with a recorded reason — the exact
 * same shape as the negative-stock guard (`evaluateNegativeGuard`).
 */
export function evaluateOverReceiptGuard(params: {
  orderedQty: number;
  alreadyReceivedQty: number;
  deltaQty: number;
  allowOverride: boolean;
  overrideReason?: string | null;
}): OverReceiptGuardResult {
  const resultingReceived = round3(params.alreadyReceivedQty + params.deltaQty);
  if (resultingReceived <= round3(params.orderedQty)) {
    return { ok: true, resultingReceived, blocked: false };
  }
  if (params.allowOverride && params.overrideReason && params.overrideReason.trim().length > 0) {
    return {
      ok: true,
      resultingReceived,
      blocked: false,
      reason: `Owner override: ${params.overrideReason.trim()}`,
    };
  }
  return {
    ok: false,
    resultingReceived,
    blocked: true,
    reason:
      'Receiving this quantity would exceed the ordered amount. Requires an Owner override with a recorded reason.',
  };
}

/** Statuses that may still receive stock. */
export function canReceiveAgainst(status: PoStatus): boolean {
  return status === 'ordered' || status === 'partially_received';
}

/** Statuses from which a PO may be cancelled (a fully received PO has nothing left to cancel). */
export function canCancel(status: PoStatus): boolean {
  return status === 'draft' || status === 'ordered' || status === 'partially_received';
}

/** True once the expected arrival date has passed without full receipt. */
export function isOverdue(expectedArrivalDate: BusinessDate | null, today: BusinessDate): boolean {
  if (!expectedArrivalDate) return false;
  return expectedArrivalDate < today;
}

/** True when the expected arrival date falls within the next `days` days (inclusive), not yet overdue. */
export function isDueWithinDays(
  expectedArrivalDate: BusinessDate | null,
  today: BusinessDate,
  days: number,
): boolean {
  if (!expectedArrivalDate) return false;
  return expectedArrivalDate >= today && expectedArrivalDate <= addDays(today, days);
}

/** Overdue OR due within `days` days — the single window used by the Telegram report. */
export function isDueOrOverdue(
  expectedArrivalDate: BusinessDate | null,
  today: BusinessDate,
  days = 7,
): boolean {
  if (!expectedArrivalDate) return false;
  return expectedArrivalDate <= addDays(today, days);
}
