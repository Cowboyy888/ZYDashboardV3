import { describe, it, expect } from 'vitest';
import { canCancel, isCurrency, CURRENCIES } from '@/lib/domain/purchasing';

describe('canCancel', () => {
  it('allows cancelling draft and ordered', () => {
    expect(canCancel('draft')).toBe(true);
    expect(canCancel('ordered')).toBe(true);
  });
  it('blocks cancelling an already-cancelled PO', () => {
    expect(canCancel('cancelled')).toBe(false);
  });
});

describe('currency', () => {
  it('recognises exactly USD/KHR/CNY', () => {
    expect(CURRENCIES).toEqual(['USD', 'KHR', 'CNY']);
    expect(isCurrency('USD')).toBe(true);
    expect(isCurrency('EUR')).toBe(false);
  });
});
