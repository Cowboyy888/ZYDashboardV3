/**
 * Append-only stock ledger.
 *
 * Stock is NEVER stored as an editable total. Every change is a signed movement
 * and the balance is always the SUM of movement quantities:
 *
 *   balance = Σ quantity
 *
 * Sign convention (stored directly on each movement so SUM() is the balance):
 *   opening_balance   +   (initial count; positive)
 *   purchase_receipt  +   (goods received)
 *   production_output +   (produced 张)
 *   transfer_in       +   (arriving from another location)
 *   sale_delivery     −   (confirmed delivery)
 *   other_stock_out   −   (damage / factory use / correction out)
 *   transfer_out      −   (leaving a location)
 *   adjustment        ±   (signed correction)
 *
 * A stock transfer is always a *pair*: transfer_out at the source and
 * transfer_in at the destination with equal magnitude, so the company-wide
 * total is invariant.
 */

export const MOVEMENT_TYPES = [
  'opening_balance',
  'purchase_receipt',
  'production_output',
  'sale_delivery',
  'other_stock_out',
  'adjustment',
  'transfer_out',
  'transfer_in',
] as const;

export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type MovementDirection = 'in' | 'out' | 'either';

/** Direction each movement type contributes to a location balance. */
export const MOVEMENT_DIRECTION: Record<MovementType, MovementDirection> = {
  opening_balance: 'in',
  purchase_receipt: 'in',
  production_output: 'in',
  transfer_in: 'in',
  sale_delivery: 'out',
  other_stock_out: 'out',
  transfer_out: 'out',
  adjustment: 'either',
};

export interface MovementInput {
  skuId: string;
  locationId: string;
  type: MovementType;
  /** SIGNED quantity as stored in the ledger. */
  quantity: number;
}

/** Round to 3 decimals to keep decimal 捆 quantities free of float noise. */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * Convert a user-entered positive magnitude + type into a signed ledger value.
 * For `adjustment`, pass the already-signed delta (magnitude may be negative).
 */
export function toSignedQuantity(type: MovementType, magnitude: number): number {
  if (type === 'adjustment') return round3(magnitude);
  const abs = Math.abs(magnitude);
  return MOVEMENT_DIRECTION[type] === 'out' ? round3(-abs) : round3(abs);
}

const key = (skuId: string, locationId: string) => `${skuId}::${locationId}`;

/** Balance for one SKU at one location. */
export function balanceForSkuLocation(
  movements: MovementInput[],
  skuId: string,
  locationId: string,
): number {
  const total = movements
    .filter((m) => m.skuId === skuId && m.locationId === locationId)
    .reduce((sum, m) => sum + m.quantity, 0);
  return round3(total);
}

/** Company-wide balance for one SKU across all locations. */
export function companyBalanceForSku(movements: MovementInput[], skuId: string): number {
  const total = movements.filter((m) => m.skuId === skuId).reduce((sum, m) => sum + m.quantity, 0);
  return round3(total);
}

/** Sum of all signed quantities (grand company total across every SKU). */
export function companyGrandTotal(movements: MovementInput[]): number {
  return round3(movements.reduce((sum, m) => sum + m.quantity, 0));
}

export interface Balance {
  skuId: string;
  locationId: string;
  quantity: number;
}

/** All non-zero balances grouped by SKU + location. */
export function balancesBySkuLocation(movements: MovementInput[]): Balance[] {
  const map = new Map<string, Balance>();
  for (const m of movements) {
    const k = key(m.skuId, m.locationId);
    const existing = map.get(k);
    if (existing) {
      existing.quantity = round3(existing.quantity + m.quantity);
    } else {
      map.set(k, { skuId: m.skuId, locationId: m.locationId, quantity: round3(m.quantity) });
    }
  }
  return [...map.values()];
}

/** All balances grouped by SKU (company total per SKU). */
export function balancesBySku(
  movements: MovementInput[],
): Array<{ skuId: string; quantity: number }> {
  const map = new Map<string, number>();
  for (const m of movements) {
    map.set(m.skuId, (map.get(m.skuId) ?? 0) + m.quantity);
  }
  return [...map.entries()].map(([skuId, quantity]) => ({ skuId, quantity: round3(quantity) }));
}

export interface TransferRequest {
  skuId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number; // positive magnitude
  transferGroupId: string;
}

/**
 * Build the matching transfer_out / transfer_in pair for a transfer.
 * Guarantees equal magnitude so the company total does not change.
 */
export function buildTransferPair(req: TransferRequest): [MovementInput, MovementInput] {
  const magnitude = Math.abs(req.quantity);
  if (magnitude === 0) throw new Error('Transfer quantity must be greater than zero.');
  if (req.fromLocationId === req.toLocationId) {
    throw new Error('Transfer source and destination must differ.');
  }
  return [
    {
      skuId: req.skuId,
      locationId: req.fromLocationId,
      type: 'transfer_out',
      quantity: round3(-magnitude),
    },
    {
      skuId: req.skuId,
      locationId: req.toLocationId,
      type: 'transfer_in',
      quantity: round3(magnitude),
    },
  ];
}

export interface NegativeGuardResult {
  ok: boolean;
  resultingBalance: number;
  blocked: boolean;
  reason?: string;
}

/**
 * Decide whether a proposed movement may be posted.
 * Blocks any move that would drive a location balance below zero, UNLESS the
 * actor is an Owner overriding with a recorded reason.
 */
export function evaluateNegativeGuard(params: {
  currentBalance: number;
  delta: number;
  allowOverride: boolean;
  overrideReason?: string | null;
}): NegativeGuardResult {
  const resultingBalance = round3(params.currentBalance + params.delta);
  if (resultingBalance >= 0) {
    return { ok: true, resultingBalance, blocked: false };
  }
  if (params.allowOverride && params.overrideReason && params.overrideReason.trim().length > 0) {
    return {
      ok: true,
      resultingBalance,
      blocked: false,
      reason: `Owner override: ${params.overrideReason.trim()}`,
    };
  }
  return {
    ok: false,
    resultingBalance,
    blocked: true,
    reason:
      resultingBalance < 0
        ? 'Movement would drive stock negative. Requires an Owner override with a recorded reason.'
        : undefined,
  };
}
