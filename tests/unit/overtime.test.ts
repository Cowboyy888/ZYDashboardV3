import { describe, it, expect } from 'vitest';
import {
  tier1Amount,
  tier2Amount,
  overtimeTotal,
  totalHours,
  blendedRate,
  splitTimeRange,
  parseClock,
  summarizeOvertime,
  DEFAULT_OVERTIME_RATES,
  type OvertimeEntryLike,
} from '@/lib/domain/overtime';

describe('加班表 formula — F = 1.25*E, H = 2*G, I = F+H', () => {
  it('computes tier amounts at the sheet rates', () => {
    expect(tier1Amount(1)).toBe(1.25); // =1.25*E4 (E=1)
    expect(tier1Amount(1.5)).toBe(1.88); // =1.25*1.5 = 1.875 -> 1.88
    expect(tier2Amount(0)).toBe(0); // =2*G4 (G=0)
    expect(tier2Amount(2)).toBe(4); // =2*G12 (G=2)
    expect(tier2Amount(0.5)).toBe(1); // =2*0.5
  });

  it('reproduces real rows from the July sheet', () => {
    // Row 4: Krin Kinal 16:30-17:30 — E=1, G=0 -> 1.25 + 0
    expect(overtimeTotal({ tier1Hours: 1, tier2Hours: 0 })).toBe(1.25);
    // Row 6: Khem Piseth 16:30-18:30 — E=1.5, G=0.5 -> 1.875 + 1 = 2.88
    expect(overtimeTotal({ tier1Hours: 1.5, tier2Hours: 0.5 })).toBe(2.88);
    // Row 12: 16:30-20:00 — E=1.5, G=2 -> 1.875 + 4 = 5.88
    expect(overtimeTotal({ tier1Hours: 1.5, tier2Hours: 2 })).toBe(5.88);
    // Row 8: khem Phearith 16:30-19:30 — E=1.5, G=1.5 -> 1.875 + 3 = 4.88
    expect(overtimeTotal({ tier1Hours: 1.5, tier2Hours: 1.5 })).toBe(4.88);
  });

  it('honours configurable rates instead of hard-coded literals', () => {
    const rates = { tier1Rate: 1.5, tier2Rate: 2.5 };
    expect(tier1Amount(2, rates.tier1Rate)).toBe(3);
    expect(tier2Amount(2, rates.tier2Rate)).toBe(5);
    expect(overtimeTotal({ tier1Hours: 2, tier2Hours: 2 }, rates)).toBe(8);
  });

  it('treats missing/negative hours as zero', () => {
    expect(overtimeTotal({ tier1Hours: null, tier2Hours: null })).toBe(0);
    expect(overtimeTotal({ tier1Hours: -3, tier2Hours: 1 })).toBe(2);
  });

  it('reports total and blended hourly rate', () => {
    expect(totalHours({ tier1Hours: 1.5, tier2Hours: 2 })).toBe(3.5);
    // 5.875 / 3.5 = 1.678... -> 1.68
    expect(blendedRate({ tier1Hours: 1.5, tier2Hours: 2 })).toBe(1.68);
    expect(blendedRate({ tier1Hours: 0, tier2Hours: 0 })).toBe(0);
  });

  it('uses the spreadsheet rates as defaults', () => {
    expect(DEFAULT_OVERTIME_RATES).toEqual({ tier1Rate: 1.25, tier2Rate: 2.0 });
  });
});

describe('splitting a worked window into tiers', () => {
  it('parses clock values incl. the full-width colon used in the sheet', () => {
    expect(parseClock('16:30')).toBe(990);
    expect(parseClock('16：30')).toBe(990); // full-width
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock('nope')).toBeNull();
  });

  it('splits the ranges used in the sheet', () => {
    expect(splitTimeRange('16:30-17:30')).toEqual({ tier1Hours: 1, tier2Hours: 0 });
    expect(splitTimeRange('16：30-18：30')).toEqual({ tier1Hours: 1.5, tier2Hours: 0.5 });
    expect(splitTimeRange('16:30-20:00')).toEqual({ tier1Hours: 1.5, tier2Hours: 2 });
    expect(splitTimeRange('16:30-19:30')).toEqual({ tier1Hours: 1.5, tier2Hours: 1.5 });
  });

  it('ignores time outside the tier windows', () => {
    // 15:00-16:00 is before tier 1 starts -> no paid overtime hours.
    expect(splitTimeRange('15:00-16:00')).toEqual({ tier1Hours: 0, tier2Hours: 0 });
    // Past 20:00 is not counted by the sheet's two tiers.
    expect(splitTimeRange('18:00-22:00')).toEqual({ tier1Hours: 0, tier2Hours: 2 });
  });

  it('returns null for unparseable ranges', () => {
    expect(splitTimeRange('all evening')).toBeNull();
    expect(splitTimeRange('18:00-16:00')).toBeNull(); // end before start
  });
});

describe('dashboard summary (totals always cover the same rows)', () => {
  const e = (o: Partial<OvertimeEntryLike>): OvertimeEntryLike => ({
    businessDate: '2026-07-16',
    employeeId: 'e1',
    description: '焊网',
    tier1Hours: 1.5,
    tier2Hours: 2,
    tier1Amount: 1.88,
    tier2Amount: 4,
    totalAmount: 5.88,
    ...o,
  });

  it('aggregates hours, amounts, people and rollups', () => {
    const s = summarizeOvertime([
      e({}),
      e({ employeeId: 'e2' }),
      e({ employeeId: 'e1', businessDate: '2026-07-17', description: '拔丝机' }),
    ]);
    expect(s.entries).toBe(3);
    expect(s.people).toBe(2);
    expect(s.tier1Hours).toBe(4.5);
    expect(s.tier2Hours).toBe(6);
    expect(s.totalHours).toBe(10.5);
    expect(s.totalAmount).toBe(17.64);
    expect(s.byEmployee[0]).toEqual({ key: 'e1', hours: 7, amount: 11.76, entries: 2 });
    expect(s.byTask.map((t) => t.key)).toContain('焊网');
    expect(s.byDate.map((d) => d.key)).toEqual(['2026-07-16', '2026-07-17']);
  });

  it('every tier subtotal covers all rows (the sheet summed F4:F26 but I4:I31)', () => {
    const rows = Array.from({ length: 8 }, () => e({}));
    const s = summarizeOvertime(rows);
    // tier1 + tier2 subtotals must reconcile to the grand total, always.
    expect(s.tier1Amount + s.tier2Amount).toBeCloseTo(s.totalAmount, 2);
    expect(s.tier1Amount).toBeCloseTo(1.88 * 8, 2);
  });

  it('handles an empty period', () => {
    const s = summarizeOvertime([]);
    expect(s.entries).toBe(0);
    expect(s.totalAmount).toBe(0);
    expect(s.byEmployee).toEqual([]);
  });

  it('groups untitled tasks under a placeholder', () => {
    const s = summarizeOvertime([e({ description: null }), e({ description: '  ' })]);
    expect(s.byTask).toHaveLength(1);
    expect(s.byTask[0]!.key).toBe('—');
  });
});
