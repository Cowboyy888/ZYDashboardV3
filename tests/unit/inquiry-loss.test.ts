import { describe, expect, it } from 'vitest';
import { STOCKOUT_REASON_CODE, stockoutFieldErrors } from '@/lib/domain/inquiry-loss';
import { inquirySchema } from '@/lib/validation/schemas';
import { localizeMessage, translator } from '@/lib/i18n';

describe('explicit unavailable-product request evidence', () => {
  const request = { diameter: '5.5', sheetSize: '2.4×6', meshOpening: '200×200', quantity: 100 };

  it('requires requested specification and positive quantity without inferring inventory', () => {
    expect(stockoutFieldErrors(request)).toEqual({});
    expect(Object.keys(stockoutFieldErrors({}))).toEqual([
      'diameter',
      'sheetSize',
      'meshOpening',
      'quantity',
    ]);
    for (const quantity of [0, -1, Infinity, NaN]) {
      expect(stockoutFieldErrors({ ...request, quantity }).quantity).toBeTruthy();
    }
    expect(stockoutFieldErrors({ ...request, diameter: ' ' }).diameter).toBeTruthy();
  });

  it('distinguishes an omitted reason, explicit clearing, and the dedicated stockout code', () => {
    expect(inquirySchema.parse({ customerName: 'Existing customer' }).lossReasonId).toBeUndefined();
    expect(
      inquirySchema.parse({ customerName: 'Existing customer', lossReasonId: '' }).lossReasonId,
    ).toBeNull();
    expect(
      inquirySchema.parse({ customerName: 'Existing customer', lossReasonId: STOCKOUT_REASON_CODE })
        .lossReasonId,
    ).toBe(STOCKOUT_REASON_CODE);
    expect(
      inquirySchema.safeParse({ customerName: 'Existing customer', lossReasonId: 'Specification' })
        .success,
    ).toBe(false);
  });

  it('provides both language labels and localizes stockout validation messages', () => {
    expect(translator('en')('inq.stockUnavailable')).toBe('Product unavailable');
    expect(translator('zh')('inq.stockUnavailable')).toBe('产品缺货');
    for (const message of Object.values(stockoutFieldErrors({}))) {
      expect(localizeMessage('zh', message)).not.toBe(message);
    }
  });
});
