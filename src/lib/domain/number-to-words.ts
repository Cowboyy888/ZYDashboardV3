/**
 * English amount-in-words for printed invoices — pure, no I/O.
 *
 * Supports integers up to 999,999,999,999 (just under a trillion), which
 * comfortably covers any real invoice this company issues.
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const SCALES = ['', 'Thousand', 'Million', 'Billion'];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) {
    if (rest < 20) {
      parts.push(ONES[rest]!);
    } else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      parts.push(o > 0 ? `${TENS[t]}-${ONES[o]}` : TENS[t]!);
    }
  }
  return parts.join(' ');
}

/** Non-negative integer -> English words, e.g. integerToWords(10000) === 'Ten Thousand'. */
export function integerToWords(n: number): string {
  const whole = Math.trunc(Math.abs(n));
  if (whole === 0) return 'Zero';
  const groups: string[] = [];
  let remaining = whole;
  let scale = 0;
  while (remaining > 0) {
    const group = remaining % 1000;
    if (group > 0) {
      const words = threeDigitsToWords(group);
      groups.unshift(SCALES[scale] ? `${words} ${SCALES[scale]}` : words);
    }
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  return groups.join(' ');
}

/** Major/minor unit names per currency, e.g. "US Dollars" / "Cents". */
export const CURRENCY_WORDS: Record<string, { major: string; minor: string }> = {
  USD: { major: 'US Dollars', minor: 'Cents' },
  KHR: { major: 'Riel', minor: 'Sen' },
  CNY: { major: 'RMB', minor: 'Fen' },
};

/**
 * Full amount-in-words line for a printed invoice, e.g.
 *   amountInWords(10000, 'USD')   === 'Ten Thousand US Dollars Only'
 *   amountInWords(10000.5, 'USD') === 'Ten Thousand US Dollars and Fifty Cents Only'
 * Unknown currencies fall back to the currency code itself as the major unit name.
 */
export function amountInWords(n: number, currency: string): string {
  const names = CURRENCY_WORDS[currency] ?? { major: currency, minor: 'Cents' };
  // Round to cents first so float noise (e.g. 10000.1 - 10000) never leaks in.
  const absN = Math.round(Math.abs(n) * 100) / 100;
  const whole = Math.trunc(absN);
  const cents = Math.round((absN - whole) * 100);
  const majorPart = `${integerToWords(whole)} ${names.major}`;
  if (cents === 0) return `${majorPart} Only`;
  return `${majorPart} and ${integerToWords(cents)} ${names.minor} Only`;
}
