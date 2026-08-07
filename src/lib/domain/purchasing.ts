/**
 * Purchasing — pure, no-I/O business rules.
 *
 * Purchase orders carry line items (SKU, location, quantity, unit cost) —
 * freely editable while Draft, immutable once Issued. Receiving/goods-receipt
 * stays out of scope: `status` is an explicit user transition (Issue/
 * Cancel), never receipt-derived.
 */
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

export const PO_STATUSES = ['draft', 'ordered', 'cancelled'] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export function isPoStatus(value: unknown): value is PoStatus {
  return typeof value === 'string' && (PO_STATUSES as readonly string[]).includes(value);
}

export const PO_STATUS_LABELS: Record<PoStatus, { en: string; zh: string }> = {
  draft: { en: 'Draft', zh: '草稿' },
  ordered: { en: 'Ordered', zh: '已下单' },
  cancelled: { en: 'Cancelled', zh: '已取消' },
};

/** Statuses from which a PO may be cancelled. */
export function canCancel(status: PoStatus): boolean {
  return status === 'draft' || status === 'ordered';
}
