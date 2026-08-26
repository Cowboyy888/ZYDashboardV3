/**
 * Sales commission — pure, no-I/O rules (toolkit sheet 19).
 *
 *   gross profit  F = D − E                revenue − factory cost
 *   margin        G = F / D
 *   rate          H = first band whose upper limit the margin is below
 *   accrual       J = by payment status    (collected revenue only)
 *   payable       K = F × H × J
 *
 * Commission is earned on the GROSS PROFIT of COLLECTED revenue — the accrual
 * factor is what stops a salesperson being paid in full on an invoice the
 * company has not been paid for.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** Payment states that drive the accrual factor. */
export const PAYMENT_STATUSES = [
  'paid_in_full',
  'deposit_only',
  'overdue_31_60',
  'bad_debt',
  'other',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { en: string; zh: string }> = {
  paid_in_full: { en: 'Paid in full', zh: '已全额付款' },
  deposit_only: { en: 'Deposit only', zh: '仅付订金' },
  overdue_31_60: { en: 'Overdue 31–60 days', zh: '逾期 31–60 天' },
  bad_debt: { en: 'Bad debt', zh: '坏账' },
  other: { en: 'Other', zh: '其他' },
};

/**
 * Share of the commission that accrues now, by payment status (workbook J).
 * Bad debt earns nothing; anything unrecognised accrues at half, matching the
 * spreadsheet's final `else 0.5` branch.
 */
export function accrualPct(status: PaymentStatus | string | null | undefined): number {
  switch (status) {
    case 'paid_in_full':
      return 1;
    case 'bad_debt':
      return 0;
    case 'deposit_only':
    case 'overdue_31_60':
      return 0.5;
    default:
      return 0.5;
  }
}

/** One row of the margin-band table. */
export interface CommissionBand {
  /** Commission applies when margin is BELOW this limit. */
  upperMarginLimit: number;
  rate: number;
}

/** The workbook's bands, used when none are configured. */
export const DEFAULT_COMMISSION_BANDS: CommissionBand[] = [
  { upperMarginLimit: 0.1, rate: 0 }, // below the margin floor
  { upperMarginLimit: 0.12, rate: 0.05 },
  { upperMarginLimit: 0.18, rate: 0.08 },
  { upperMarginLimit: 0.25, rate: 0.12 },
  { upperMarginLimit: 1.0, rate: 0.15 },
];

/** The margin floor — below this a sale needs the owner's approval. */
export function marginFloor(bands: CommissionBand[] = DEFAULT_COMMISSION_BANDS): number {
  return bands.length > 0
    ? [...bands].sort((a, b) => a.upperMarginLimit - b.upperMarginLimit)[0]!.upperMarginLimit
    : 0;
}

/** `F = D − E`. */
export function grossProfit(revenue: number | null, factoryCost: number | null): number {
  return round2(num(revenue) - num(factoryCost));
}

/** `G = F / D`. Zero revenue yields a zero margin rather than a divide-by-zero. */
export function marginPct(revenue: number | null, factoryCost: number | null): number {
  const r = num(revenue);
  if (r <= 0) return 0;
  return (r - num(factoryCost)) / r;
}

/**
 * `H` — the rate for a margin: the first band whose upper limit the margin is
 * below, mirroring the workbook's nested IF (and the DB trigger).
 */
export function bandRate(
  margin: number,
  bands: CommissionBand[] = DEFAULT_COMMISSION_BANDS,
): number {
  const sorted = [...bands].sort((a, b) => a.upperMarginLimit - b.upperMarginLimit);
  for (const b of sorted) {
    if (margin < b.upperMarginLimit) return b.rate;
  }
  return sorted.length > 0 ? sorted[sorted.length - 1]!.rate : 0;
}

/** True when a sale sits below the margin floor (owner approval required). */
export function isBelowMarginFloor(
  margin: number,
  bands: CommissionBand[] = DEFAULT_COMMISSION_BANDS,
): boolean {
  return margin < marginFloor(bands);
}

export interface CommissionInput {
  revenue: number | null;
  factoryCost: number | null;
  paymentStatus: PaymentStatus | string | null;
}

export interface CommissionResult {
  grossProfit: number;
  marginPct: number;
  rate: number;
  accrual: number;
  payable: number;
  belowFloor: boolean;
}

/** `K = F × H × J`, with every intermediate value the payslip needs to show. */
export function calculateCommission(
  input: CommissionInput,
  bands: CommissionBand[] = DEFAULT_COMMISSION_BANDS,
): CommissionResult {
  const gp = grossProfit(input.revenue, input.factoryCost);
  const margin = marginPct(input.revenue, input.factoryCost);
  const rate = bandRate(margin, bands);
  const accrual = accrualPct(input.paymentStatus);
  return {
    grossProfit: gp,
    marginPct: margin,
    rate,
    accrual,
    payable: round2(gp * rate * accrual),
    belowFloor: isBelowMarginFloor(margin, bands),
  };
}

export interface CommissionTotals {
  entries: number;
  revenue: number;
  grossProfit: number;
  payable: number;
  /** Entries priced below the margin floor — should be zero. */
  belowFloorCount: number;
}

/** Roll a set of entries up for a period (one salesperson or the whole team). */
export function totalCommission(
  inputs: CommissionInput[],
  bands: CommissionBand[] = DEFAULT_COMMISSION_BANDS,
): CommissionTotals {
  let revenue = 0;
  let gp = 0;
  let payable = 0;
  let belowFloor = 0;

  for (const i of inputs) {
    const r = calculateCommission(i, bands);
    revenue += num(i.revenue);
    gp += r.grossProfit;
    payable += r.payable;
    if (r.belowFloor) belowFloor += 1;
  }
  return {
    entries: inputs.length,
    revenue: round2(revenue),
    grossProfit: round2(gp),
    payable: round2(payable),
    belowFloorCount: belowFloor,
  };
}
