import { describe, it, expect } from 'vitest';
import {
  followUpCompliance,
  totalContacts,
  totalActivity,
  grossProfit,
  marginPct,
  quoteToOrderRate,
  weeklySummary,
  achievement,
  scoreMetrics,
  type DailyActivity,
} from '@/lib/domain/activity-report';

const day = (o: Partial<DailyActivity> = {}): DailyActivity => ({
  businessDate: '2026-09-04',
  employeeId: 'dara',
  newLeads: 12,
  calls: 9,
  messages: 14,
  followUpsDone: 8,
  followUpsDue: 8,
  fieldVisits: 6,
  quotations: 2,
  quotationValue: 11400,
  orders: 1,
  orderValue: 3200,
  ...o,
});

describe('follow-up compliance (workbook M)', () => {
  it('divides done by due', () => {
    expect(followUpCompliance(8, 8)).toBe(1);
    expect(followUpCompliance(4, 8)).toBe(0.5);
  });

  it('treats nothing due as full compliance, not a divide-by-zero', () => {
    expect(followUpCompliance(0, 0)).toBe(1);
    expect(followUpCompliance(3, 0)).toBe(1);
  });

  it('caps at 1 so extra work cannot mask another day’s miss', () => {
    expect(followUpCompliance(12, 8)).toBe(1);
  });
});

describe('daily totals', () => {
  it('counts every outbound touch as a contact', () => {
    expect(totalContacts(day())).toBe(29); // 9 calls + 14 messages + 6 visits
  });

  it('sums a set of days and recomputes compliance from the totals', () => {
    const t = totalActivity([
      day({ followUpsDone: 8, followUpsDue: 8 }),
      day({ businessDate: '2026-09-05', followUpsDone: 2, followUpsDue: 10 }),
    ]);
    expect(t.days).toBe(2);
    expect(t.newLeads).toBe(24);
    expect(t.quotationValue).toBe(22800);
    expect(t.orders).toBe(2);
    // 10 done / 18 due — NOT the average of 100% and 20%.
    expect(t.followUpCompliance).toBeCloseTo(10 / 18, 6);
  });

  it('counts distinct people and distinct days', () => {
    const t = totalActivity([
      day({ employeeId: 'dara' }),
      day({ employeeId: 'sina' }),
      day({ employeeId: 'dara', businessDate: '2026-09-05' }),
    ]);
    expect(t.people).toBe(2);
    expect(t.days).toBe(2);
  });

  it('handles an empty period', () => {
    const t = totalActivity([]);
    expect(t.days).toBe(0);
    expect(t.followUpCompliance).toBe(1); // nothing due
    expect(t.orderValue).toBe(0);
  });
});

describe('weekly gross profit and margin (workbook J and K)', () => {
  it('reproduces the sheet rows', () => {
    // W36 Dara: revenue 6,400, cost 5,171 → GP 1,229, margin 19.2%
    expect(grossProfit({ revenue: 6400, cost: 5171 })).toBe(1229);
    expect(marginPct({ revenue: 6400, cost: 5171 })).toBeCloseTo(0.192031, 5);
    // W36 Sina: 8,900 − 6,978 = 1,922
    expect(grossProfit({ revenue: 8900, cost: 6978 })).toBe(1922);
  });

  it('never divides by zero revenue', () => {
    expect(marginPct({ revenue: 0, cost: 500 })).toBe(0);
    expect(marginPct({ revenue: null, cost: null })).toBe(0);
  });

  it('computes quote-to-order conversion', () => {
    expect(quoteToOrderRate(7, 2)).toBeCloseTo(2 / 7, 6);
    expect(quoteToOrderRate(0, 0)).toBe(0);
  });
});

describe('weekly summary', () => {
  it('rolls dailies up with supplied financials', () => {
    const w = weeklySummary([day(), day({ businessDate: '2026-09-05' })], {
      revenue: 6400,
      cost: 5171,
    });
    expect(w.revenue).toBe(6400);
    expect(w.grossProfit).toBe(1229);
    expect(w.quotations).toBe(4);
    expect(w.quoteToOrderRate).toBe(0.5); // 2 orders / 4 quotations
  });

  it('falls back to the summed order value when no revenue is given', () => {
    const w = weeklySummary([day({ orderValue: 3200 }), day({ orderValue: 800 })]);
    expect(w.revenue).toBe(4000);
    expect(w.cost).toBe(0);
    expect(w.grossProfit).toBe(4000);
  });
});

describe('monthly achievement (workbook D)', () => {
  it('divides actual by target', () => {
    // Revenue 51,200 against 55,000 → 93%
    expect(achievement(51200, 55000)).toBeCloseTo(0.930909, 5);
    expect(achievement(9254, 9900)).toBeCloseTo(0.934747, 5);
  });

  it('is null when no target is set', () => {
    expect(achievement(100, null)).toBeNull();
    expect(achievement(100, 0)).toBeNull();
  });

  it('states the gap as a number, not just a percentage', () => {
    const scored = scoreMetrics([
      { label: 'Revenue', target: 55000, actual: 51200 },
      { label: 'Gross profit', target: 9900, actual: 9254 },
      { label: 'Beat it', target: 100, actual: 120 },
    ]);
    expect(scored[0]!.gap).toBe(3800);
    expect(scored[1]!.gap).toBe(646);
    expect(scored[2]!.gap).toBe(0); // over target is not a negative gap
    expect(scored[2]!.achievement).toBeCloseTo(1.2, 6);
  });
});
