import { describe, it, expect } from 'vitest';
import {
  computeSoStatus,
  computeOutstanding,
  computeCommittedStock,
  evaluateOverDeliveryGuard,
  canDeliverAgainst,
  canCancel,
  isOverdue,
  isDueWithinDays,
  isCurrency,
  CURRENCIES,
} from '@/lib/domain/sales';

describe('computeSoStatus — Partially Delivered vs Delivered', () => {
  it('is partially_delivered while delivered < ordered', () => {
    expect(computeSoStatus(500, 150)).toBe('partially_delivered');
    expect(computeSoStatus(500, 0)).toBe('partially_delivered');
  });
  it('is delivered once delivered >= ordered', () => {
    expect(computeSoStatus(500, 500)).toBe('delivered');
    expect(computeSoStatus(500, 500.0001)).toBe('delivered'); // rounding tolerance
  });
});

describe('computeOutstanding', () => {
  it('is ordered minus delivered', () => {
    expect(computeOutstanding(500, 150)).toBe(350);
    expect(computeOutstanding(500, 500)).toBe(0);
  });
});

describe('computeCommittedStock — kept separate from physical stock', () => {
  it('subtracts outstanding ordered quantity from physical stock', () => {
    expect(computeCommittedStock(100, 50)).toBe(50);
  });
  it('can go negative — that is meaningful (oversold)', () => {
    expect(computeCommittedStock(100, 150)).toBe(-50);
  });
  it('never adds (negative outstanding is clamped to zero before subtracting)', () => {
    expect(computeCommittedStock(100, -20)).toBe(100);
  });
  it('equals physical stock when nothing is outstanding', () => {
    expect(computeCommittedStock(100, 0)).toBe(100);
  });
});

describe('evaluateOverDeliveryGuard — blocked unless Owner override with a reason', () => {
  it('allows a delivery that does not exceed the ordered quantity', () => {
    const g = evaluateOverDeliveryGuard({
      orderedQty: 500,
      alreadyDeliveredQty: 150,
      deltaQty: 350,
      allowOverride: false,
    });
    expect(g.ok).toBe(true);
    expect(g.resultingDelivered).toBe(500);
  });

  it('blocks a delivery that would exceed the ordered quantity, no override', () => {
    const g = evaluateOverDeliveryGuard({
      orderedQty: 500,
      alreadyDeliveredQty: 400,
      deltaQty: 200,
      allowOverride: false,
    });
    expect(g.ok).toBe(false);
    expect(g.blocked).toBe(true);
  });

  it('blocks even with allowOverride=true if no reason is recorded', () => {
    const g = evaluateOverDeliveryGuard({
      orderedQty: 500,
      alreadyDeliveredQty: 400,
      deltaQty: 200,
      allowOverride: true,
      overrideReason: '   ',
    });
    expect(g.ok).toBe(false);
  });

  it('allows over-delivery only for an Owner with a recorded reason', () => {
    const g = evaluateOverDeliveryGuard({
      orderedQty: 500,
      alreadyDeliveredQty: 400,
      deltaQty: 200,
      allowOverride: true,
      overrideReason: 'Customer requested extra units as goodwill',
    });
    expect(g.ok).toBe(true);
    expect(g.resultingDelivered).toBe(600);
    expect(g.reason).toContain('Owner override');
  });
});

describe('canDeliverAgainst — a cancelled or draft SO cannot be delivered against', () => {
  it('allows delivery for confirmed and partially_delivered', () => {
    expect(canDeliverAgainst('confirmed')).toBe(true);
    expect(canDeliverAgainst('partially_delivered')).toBe(true);
  });
  it('blocks delivery for draft, delivered, and cancelled', () => {
    expect(canDeliverAgainst('draft')).toBe(false);
    expect(canDeliverAgainst('delivered')).toBe(false);
    expect(canDeliverAgainst('cancelled')).toBe(false);
  });
});

describe('canCancel', () => {
  it('allows cancelling draft, confirmed, and partially_delivered', () => {
    expect(canCancel('draft')).toBe(true);
    expect(canCancel('confirmed')).toBe(true);
    expect(canCancel('partially_delivered')).toBe(true);
  });
  it('blocks cancelling a fully delivered or already-cancelled SO', () => {
    expect(canCancel('delivered')).toBe(false);
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
});

describe('currency (re-exported from purchasing — one shared set app-wide)', () => {
  it('recognises exactly USD/KHR/CNY', () => {
    expect(CURRENCIES).toEqual(['USD', 'KHR', 'CNY']);
    expect(isCurrency('USD')).toBe(true);
    expect(isCurrency('EUR')).toBe(false);
  });
});
