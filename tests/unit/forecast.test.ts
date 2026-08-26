import { describe, it, expect } from 'vitest';
import {
  weighted,
  scenarios,
  forecastMonth,
  forecastByMonth,
  forecastWindow,
  tonnageMix,
  COMMIT_THRESHOLD,
  type ForecastDeal,
} from '@/lib/domain/forecast';

const deal = (o: Partial<ForecastDeal> = {}): ForecastDeal => ({
  value: 1000,
  probability: 0.5,
  expectedCloseDate: '2026-09-30',
  tonnage: 1,
  familyId: 'mesh',
  ownerId: 'dara',
  ...o,
});

describe('weighted value (workbook F = D × E)', () => {
  it('reproduces the sheet rows', () => {
    expect(weighted(deal({ value: 7850, probability: 0.65 }))).toBe(5102.5);
    expect(weighted(deal({ value: 34200, probability: 0.65 }))).toBe(22230);
    expect(weighted(deal({ value: 940, probability: 0.9 }))).toBe(846);
  });

  it('treats missing inputs as zero', () => {
    expect(weighted(deal({ value: null }))).toBe(0);
    expect(weighted(deal({ probability: null }))).toBe(0);
  });
});

describe('three scenarios', () => {
  const deals = [
    deal({ value: 7850, probability: 0.65 }),
    deal({ value: 34200, probability: 0.65 }),
    deal({ value: 940, probability: 0.9 }), // commit
  ];

  it('computes commit, likely and best', () => {
    const s = scenarios(deals);
    expect(s.commit).toBe(940); // only the ≥90% deal
    expect(s.likely).toBe(28178.5); // 5102.50 + 22230 + 846
    expect(s.best).toBe(42990); // every deal in full
  });

  it('always holds commit ≤ likely ≤ best', () => {
    const s = scenarios(deals);
    expect(s.commit).toBeLessThanOrEqual(s.likely);
    expect(s.likely).toBeLessThanOrEqual(s.best);
  });

  it('counts a deal exactly at the commit threshold', () => {
    const s = scenarios([deal({ value: 500, probability: COMMIT_THRESHOLD })]);
    expect(s.commit).toBe(500);
  });

  it('returns zeroes for an empty forecast', () => {
    expect(scenarios([])).toEqual({ commit: 0, likely: 0, best: 0 });
  });
});

describe('grouping by expected close month', () => {
  it('buckets deals by month, oldest first', () => {
    const { months } = forecastByMonth([
      deal({ expectedCloseDate: '2026-10-05', value: 100, probability: 1 }),
      deal({ expectedCloseDate: '2026-09-12', value: 200, probability: 0.5 }),
      deal({ expectedCloseDate: '2026-09-25', value: 300, probability: 0.5 }),
    ]);
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(months[0]!.deals).toBe(2);
    expect(months[0]!.value).toBe(500);
    expect(months[0]!.weighted).toBe(250);
  });

  it('separates undated deals rather than hiding them as zero revenue', () => {
    const { months, undated } = forecastByMonth([
      deal({ expectedCloseDate: null, value: 900 }),
      deal({ expectedCloseDate: '2026-09-01', value: 100 }),
    ]);
    expect(months).toHaveLength(1);
    expect(undated.deals).toBe(1);
    expect(undated.value).toBe(900);
  });

  it('extracts the month from a date', () => {
    expect(forecastMonth('2026-09-12')).toBe('2026-09');
    expect(forecastMonth(null)).toBeNull();
  });
});

describe('90-day window', () => {
  const today = '2026-09-06';

  it('includes deals expected within the horizon', () => {
    const r = forecastWindow(
      [
        deal({ expectedCloseDate: '2026-09-30' }), // in
        deal({ expectedCloseDate: '2026-12-01' }), // in (86 days)
        deal({ expectedCloseDate: '2027-01-15' }), // out
        deal({ expectedCloseDate: null }), // out — undated
      ],
      today,
    );
    expect(r.deals).toHaveLength(2);
  });

  it('keeps slipped deals in view and counts them', () => {
    const r = forecastWindow(
      [
        deal({ expectedCloseDate: '2026-08-01' }), // already slipped
        deal({ expectedCloseDate: '2026-09-30' }),
      ],
      today,
    );
    expect(r.deals).toHaveLength(2);
    expect(r.slipped).toBe(1);
  });

  it('honours a custom horizon', () => {
    const r = forecastWindow([deal({ expectedCloseDate: '2026-10-30' })], today, 30);
    expect(r.deals).toHaveLength(0);
  });
});

describe('tonnage mix', () => {
  it('rolls tonnage and value up by product family, heaviest first', () => {
    const mix = tonnageMix([
      deal({ familyId: 'mesh', tonnage: 10, value: 1000 }),
      deal({ familyId: 'mesh', tonnage: 5, value: 500 }),
      deal({ familyId: 'wire', tonnage: 2, value: 200 }),
    ]);
    expect(mix[0]).toEqual({ key: 'mesh', deals: 2, value: 1500, tonnage: 15 });
    expect(mix[1]!.key).toBe('wire');
  });

  it('groups deals with no family under a placeholder', () => {
    const mix = tonnageMix([deal({ familyId: null })]);
    expect(mix[0]!.key).toBe('—');
  });
});
