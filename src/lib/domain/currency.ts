/** Shared currencies for Sales and pricing. */
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
