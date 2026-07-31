import { describe, it, expect } from 'vitest';
import {
  canCancel,
  isOverdue,
  isDueWithinDays,
  isDueOrOverdue,
  isCurrency,
  CURRENCIES,
} from '@/lib/domain/purchasing';

describe('canCancel', () => {
  it('allows cancelling draft and ordered', () => {
    expect(canCancel('draft')).toBe(true);
    expect(canCancel('ordered')).toBe(true);
  });
  it('blocks cancelling an already-cancelled PO', () => {
    expect(canCancel('cancelled')).toBe(false);
  });
});

describe('date-window helpers (Cambodia business dates, string comparison)', () => {
  const today = '2026-07-25';

  it('isOverdue is true only strictly before today', () => {
    expect(isOverdue('2026-07-24', today)).toBe(true);
    expect(isOverdue('2026-07-25', today)).toBe(false);
    expect(isOverdue(null, today)).toBe(false);
  });

  it('isDueWithinDays covers [today, today+days] inclusive, not overdue', () => {
    expect(isDueWithinDays('2026-07-25', today, 7)).toBe(true);
    expect(isDueWithinDays('2026-08-01', today, 7)).toBe(true);
    expect(isDueWithinDays('2026-08-02', today, 7)).toBe(false);
    expect(isDueWithinDays('2026-07-24', today, 7)).toBe(false); // overdue, not "due within"
  });

  it('isDueOrOverdue covers overdue (any amount) OR due within the window', () => {
    expect(isDueOrOverdue('2026-01-01', today, 7)).toBe(true); // very overdue
    expect(isDueOrOverdue('2026-07-30', today, 7)).toBe(true); // due this week
    expect(isDueOrOverdue('2026-08-05', today, 7)).toBe(false); // too far out
    expect(isDueOrOverdue(null, today, 7)).toBe(false);
  });
});

describe('currency', () => {
  it('recognises exactly USD/KHR/CNY', () => {
    expect(CURRENCIES).toEqual(['USD', 'KHR', 'CNY']);
    expect(isCurrency('USD')).toBe(true);
    expect(isCurrency('EUR')).toBe(false);
  });
});
