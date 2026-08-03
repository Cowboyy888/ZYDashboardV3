/**
 * Quotation → deposit → balance maths — pure, no I/O.
 *
 * Transcribed from ZY_Steel_Quotation.xlsx, which drives all three documents
 * from one set of line items:
 *
 *   Amount            F14 = D14 * E14            unit price × quantity
 *   Contract subtotal F16 = SUM(amounts)
 *   Deposit due now   F17 = F16 * deposit_pct
 *   Balance due       F18 = F16 - F17            (= subtotal × (1 − pct))
 *
 * The balance invoice states the same subtotal, then subtracts the deposit as a
 * negative line ("Less: 30% Deposit Paid") — `depositCredit` returns that
 * signed value so the document reads exactly like the workbook.
 */

export const DOCUMENT_KINDS = ['quotation', 'deposit', 'balance'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/** Prefix used in the document number: ZYS-Q / ZYS-DP / ZYS-BL. */
export const DOC_PREFIX: Record<DocumentKind, 'Q' | 'DP' | 'BL'> = {
  quotation: 'Q',
  deposit: 'DP',
  balance: 'BL',
};

export const DOC_TITLES: Record<DocumentKind, { en: string; zh: string }> = {
  quotation: { en: 'OFFICIAL QUOTATION', zh: '报价单' },
  deposit: { en: 'DEPOSIT INVOICE', zh: '订金发票' },
  balance: { en: 'BALANCE INVOICE', zh: '尾款发票' },
};

/** Round to 2 decimals (money) without floating-point drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const safe = (n: number | null | undefined): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : 0;

export interface QuotationLine {
  unitPrice: number | null;
  quantity: number | null;
}

/** `F14 = D14 * E14` — one line's amount. */
export function lineAmount(line: QuotationLine): number {
  return round2(safe(line.unitPrice) * safe(line.quantity));
}

/** `F16 = SUM(F14:F15…)` — the contract subtotal. */
export function subtotal(lines: QuotationLine[]): number {
  return round2(lines.reduce((sum, l) => sum + lineAmount(l), 0));
}

/** Clamp a deposit share to 0–1 (accepts 30 as 30%, for forgiving input). */
export function normalizeDepositPct(pct: number | null | undefined): number {
  const v = safe(pct);
  const share = v > 1 ? v / 100 : v;
  return Math.min(1, Math.max(0, share));
}

/** `F17 = F16 * deposit_pct` — the deposit due now. */
export function depositDue(contractSubtotal: number, depositPct: number): number {
  return round2(safe(contractSubtotal) * normalizeDepositPct(depositPct));
}

/** `F18 = F16 − F17` — the balance due before delivery. */
export function balanceDue(contractSubtotal: number, depositPct: number): number {
  return round2(safe(contractSubtotal) - depositDue(contractSubtotal, depositPct));
}

/**
 * The deposit shown as a NEGATIVE credit line on the balance invoice
 * ("Less: 30% Deposit Paid" → `=-F16*C18`).
 */
export function depositCredit(contractSubtotal: number, depositPct: number): number {
  return round2(-depositDue(contractSubtotal, depositPct));
}

/** Deposit share as a percentage for labels, e.g. 30 or 41.4 — keeps decimals entered. */
export function depositPercentLabel(depositPct: number): number {
  return round2(normalizeDepositPct(depositPct) * 100);
}

/** Balance share as a percentage, e.g. 70 or 58.6 (`C19 = 1 − C18`). */
export function balancePercentLabel(depositPct: number): number {
  return round2(100 - depositPercentLabel(depositPct));
}

export interface QuotationTotals {
  subtotal: number;
  depositPct: number;
  depositDue: number;
  balanceDue: number;
  depositPercent: number;
  balancePercent: number;
}

/** Every figure the three documents need, computed once from the lines. */
export function quotationTotals(lines: QuotationLine[], depositPct: number): QuotationTotals {
  const sub = subtotal(lines);
  return {
    subtotal: sub,
    depositPct: normalizeDepositPct(depositPct),
    depositDue: depositDue(sub, depositPct),
    balanceDue: balanceDue(sub, depositPct),
    depositPercent: depositPercentLabel(depositPct),
    balancePercent: balancePercentLabel(depositPct),
  };
}

// --- Document numbering + validity ---------------------------------------------

/** `YYMM` period used inside document numbers (e.g. 2026-07-30 → "2607"). */
export function docPeriod(isoDate: string): string {
  const [y, m] = isoDate.split('-');
  return `${(y ?? '').slice(2)}${m ?? ''}`;
}

/**
 * Document number, e.g. formatDocNo('quotation', '2026-07-30', 3)
 *   → 'ZYS-Q2607-003'
 */
export function formatDocNo(kind: DocumentKind, isoDate: string, seq: number): string {
  return `ZYS-${DOC_PREFIX[kind]}${docPeriod(isoDate)}-${String(seq).padStart(3, '0')}`;
}

/** Expiry date of a quotation = issue date + valid days (ISO `YYYY-MM-DD`). */
export function validUntil(isoDate: string, validDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + Math.max(0, Math.trunc(safe(validDays))));
  return dt.toISOString().slice(0, 10);
}

/** Has the quotation passed its validity window as of `today`? */
export function isExpired(isoDate: string, validDays: number, today: string): boolean {
  return today > validUntil(isoDate, validDays);
}
