/**
 * Sales — pure, no-I/O business rules.
 *
 * Delivered/outstanding quantity is never stored; like stock itself it is
 * always derived from the ledger (see `sales_order_item_delivered` view and
 * `buildSalesOrderRows` in ./sales-view.ts). Only `status` is a stored,
 * recomputed-on-delivery field, mirrored here so the transition rule is
 * unit-testable independently of the database trigger that also enforces it.
 */
import { addDays, type BusinessDate } from './datetime';
import { round3 } from './stock-ledger';
import { CURRENCIES, CURRENCY_LABELS, isCurrency, type Currency } from './purchasing';

export { CURRENCIES, CURRENCY_LABELS, isCurrency, type Currency };

export const SO_STATUSES = [
  'draft',
  'confirmed',
  'partially_delivered',
  'delivered',
  'cancelled',
] as const;
export type SoStatus = (typeof SO_STATUSES)[number];

export const SO_STATUS_LABELS: Record<SoStatus, { en: string; zh: string }> = {
  draft: { en: 'Draft', zh: '草稿' },
  confirmed: { en: 'Confirmed', zh: '已确认' },
  partially_delivered: { en: 'Partially Delivered', zh: '部分发货' },
  delivered: { en: 'Delivered', zh: '已发货' },
  cancelled: { en: 'Cancelled', zh: '已取消' },
};

/**
 * The status a SO should have given its total ordered vs. delivered quantity.
 * Only meaningful once the SO has been confirmed (never called for
 * draft/cancelled — those are explicit user transitions, not delivery-driven).
 */
export function computeSoStatus(orderedTotal: number, deliveredTotal: number): SoStatus {
  return round3(deliveredTotal) >= round3(orderedTotal) ? 'delivered' : 'partially_delivered';
}

/** Outstanding = ordered − delivered (never negative in normal operation). */
export function computeOutstanding(orderedQty: number, deliveredQty: number): number {
  return round3(orderedQty - deliveredQty);
}

/**
 * Committed stock = physical stock on hand − outstanding ordered quantity not
 * yet delivered. Kept deliberately separate from physical stock everywhere in
 * the UI — this is a planning number, not a balance. Unlike projected stock
 * (purchasing) this is NOT floored at zero: a negative value is meaningful —
 * it flags stock that has been sold but isn't physically available yet.
 */
export function computeCommittedStock(physicalStock: number, outstandingOrdered: number): number {
  return round3(physicalStock - Math.max(0, outstandingOrdered));
}

export interface OverDeliveryGuardResult {
  ok: boolean;
  resultingDelivered: number;
  blocked: boolean;
  reason?: string;
}

/**
 * Decide whether a proposed delivery may be posted against a SO item. Blocks
 * any delivery that would push total delivered above the ordered quantity,
 * UNLESS the actor is an Owner overriding with a recorded reason — the exact
 * same shape as the negative-stock guard (`evaluateNegativeGuard`) and the
 * over-receipt guard (`evaluateOverReceiptGuard`, purchasing).
 */
export function evaluateOverDeliveryGuard(params: {
  orderedQty: number;
  alreadyDeliveredQty: number;
  deltaQty: number;
  allowOverride: boolean;
  overrideReason?: string | null;
}): OverDeliveryGuardResult {
  const resultingDelivered = round3(params.alreadyDeliveredQty + params.deltaQty);
  if (resultingDelivered <= round3(params.orderedQty)) {
    return { ok: true, resultingDelivered, blocked: false };
  }
  if (params.allowOverride && params.overrideReason && params.overrideReason.trim().length > 0) {
    return {
      ok: true,
      resultingDelivered,
      blocked: false,
      reason: `Owner override: ${params.overrideReason.trim()}`,
    };
  }
  return {
    ok: false,
    resultingDelivered,
    blocked: true,
    reason:
      'Delivering this quantity would exceed the ordered amount. Requires an Owner override with a recorded reason.',
  };
}

/** Statuses that may still be delivered against. */
export function canDeliverAgainst(status: SoStatus): boolean {
  return status === 'confirmed' || status === 'partially_delivered';
}

/** Statuses from which a SO may be cancelled (a fully delivered SO has nothing left to cancel). */
export function canCancel(status: SoStatus): boolean {
  return status === 'draft' || status === 'confirmed' || status === 'partially_delivered';
}

/** True once the expected delivery date has passed without full delivery. */
export function isOverdue(expectedDeliveryDate: BusinessDate | null, today: BusinessDate): boolean {
  if (!expectedDeliveryDate) return false;
  return expectedDeliveryDate < today;
}

/** True when the expected delivery date falls within the next `days` days (inclusive), not yet overdue. */
export function isDueWithinDays(
  expectedDeliveryDate: BusinessDate | null,
  today: BusinessDate,
  days: number,
): boolean {
  if (!expectedDeliveryDate) return false;
  return expectedDeliveryDate >= today && expectedDeliveryDate <= addDays(today, days);
}
