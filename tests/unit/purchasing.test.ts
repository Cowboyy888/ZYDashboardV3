import { describe, it, expect } from 'vitest';
import {
  computePoStatus,
  computeOutstanding,
  computeProjectedStock,
  evaluateOverReceiptGuard,
  canReceiveAgainst,
  canCancel,
  isOverdue,
  isDueWithinDays,
  isDueOrOverdue,
  isCurrency,
  CURRENCIES,
} from '@/lib/domain/purchasing';

describe('computePoStatus — Partially Received vs Received', () => {
  it('is partially_received while received < ordered', () => {
    expect(computePoStatus(500, 150)).toBe('partially_received');
    expect(computePoStatus(500, 0)).toBe('partially_received');
  });
  it('is received once received >= ordered', () => {
    expect(computePoStatus(500, 500)).toBe('received');
    expect(computePoStatus(500, 500.0001)).toBe('received'); // rounding tolerance
  });
});

describe('computeOutstanding', () => {
  it('is ordered minus received', () => {
    expect(computeOutstanding(500, 150)).toBe(350);
    expect(computeOutstanding(500, 500)).toBe(0);
  });
});

describe('computeProjectedStock — kept separate from physical stock', () => {
  it('adds outstanding ordered quantity to physical stock', () => {
    expect(computeProjectedStock(100, 50)).toBe(150);
  });
  it('never subtracts (negative outstanding is clamped to zero)', () => {
    expect(computeProjectedStock(100, -20)).toBe(100);
  });
  it('equals physical stock when nothing is outstanding', () => {
    expect(computeProjectedStock(100, 0)).toBe(100);
  });
});

describe('evaluateOverReceiptGuard — blocked unless Owner override with a reason', () => {
  it('allows a receipt that does not exceed the ordered quantity', () => {
    const g = evaluateOverReceiptGuard({
      orderedQty: 500,
      alreadyReceivedQty: 150,
      deltaQty: 350,
      allowOverride: false,
    });
    expect(g.ok).toBe(true);
    expect(g.resultingReceived).toBe(500);
  });

  it('blocks a receipt that would exceed the ordered quantity, no override', () => {
    const g = evaluateOverReceiptGuard({
      orderedQty: 500,
      alreadyReceivedQty: 400,
      deltaQty: 200,
      allowOverride: false,
    });
    expect(g.ok).toBe(false);
    expect(g.blocked).toBe(true);
  });

  it('blocks even with allowOverride=true if no reason is recorded', () => {
    const g = evaluateOverReceiptGuard({
      orderedQty: 500,
      alreadyReceivedQty: 400,
      deltaQty: 200,
      allowOverride: true,
      overrideReason: '   ',
    });
    expect(g.ok).toBe(false);
  });

  it('allows over-receipt only for an Owner with a recorded reason', () => {
    const g = evaluateOverReceiptGuard({
      orderedQty: 500,
      alreadyReceivedQty: 400,
      deltaQty: 200,
      allowOverride: true,
      overrideReason: 'Supplier sent extra units as goodwill',
    });
    expect(g.ok).toBe(true);
    expect(g.resultingReceived).toBe(600);
    expect(g.reason).toContain('Owner override');
  });
});

describe('canReceiveAgainst — a cancelled or draft PO cannot receive stock', () => {
  it('allows receiving for ordered and partially_received', () => {
    expect(canReceiveAgainst('ordered')).toBe(true);
    expect(canReceiveAgainst('partially_received')).toBe(true);
  });
  it('blocks receiving for draft, received, and cancelled', () => {
    expect(canReceiveAgainst('draft')).toBe(false);
    expect(canReceiveAgainst('received')).toBe(false);
    expect(canReceiveAgainst('cancelled')).toBe(false);
  });
});

describe('canCancel', () => {
  it('allows cancelling draft, ordered, and partially_received', () => {
    expect(canCancel('draft')).toBe(true);
    expect(canCancel('ordered')).toBe(true);
    expect(canCancel('partially_received')).toBe(true);
  });
  it('blocks cancelling a fully received or already-cancelled PO', () => {
    expect(canCancel('received')).toBe(false);
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
