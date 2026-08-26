import { describe, it, expect } from 'vitest';
import {
  normalizeSpec,
  isSameSpec,
  toDeliveredPrice,
  priceGapPct,
  latestBySpec,
  compareToMarket,
  competitorRecords,
  staleObservations,
  PRICE_BASIS_LABELS,
  type CompetitorObservation,
} from '@/lib/domain/competitor';

const SPEC = '6mm · 200x200 · 5.0x2.0m';

const obs = (o: Partial<CompetitorObservation> = {}): CompetitorObservation => ({
  competitor: 'Competitor A',
  specification: SPEC,
  price: 30.2,
  unit: 'sheet',
  basis: 'ex_works',
  observedOn: '2026-08-28',
  dealsWonVs: 0,
  dealsLostTo: 0,
  ...o,
});

describe('specification normalisation — a price is meaningless without its spec', () => {
  it('treats different separators and casing as the same spec', () => {
    expect(isSameSpec('6mm · 200x200 · 5.0x2.0m', '6MM 200*200 5.0*2.0M')).toBe(true);
    expect(isSameSpec('6mm 200×200', '6mm 200x200')).toBe(true);
    expect(normalizeSpec('  6mm   ·  200X200 ')).toBe('6mm 200x200');
  });

  it('does not conflate genuinely different specs', () => {
    expect(isSameSpec('6mm 200x200', '7mm 200x200')).toBe(false);
    expect(isSameSpec('6mm 200x200', '6mm 150x150')).toBe(false);
  });
});

describe('putting prices on a common basis', () => {
  it('passes a delivered price straight through', () => {
    expect(toDeliveredPrice(30.2, 'delivered', null)).toBe(30.2);
  });

  it('adds delivery to an ex-works price', () => {
    expect(toDeliveredPrice(30.2, 'ex_works', 1.8)).toBe(32);
  });

  it('refuses to compare an ex-works price with no delivery cost', () => {
    // Returning null is the honest answer — the two are simply not comparable.
    expect(toDeliveredPrice(30.2, 'ex_works', null)).toBeNull();
  });

  it('labels both bases bilingually', () => {
    expect(PRICE_BASIS_LABELS.ex_works.zh).toBe('出厂价');
    expect(PRICE_BASIS_LABELS.delivered.en).toBe('Delivered');
  });
});

describe('price gap', () => {
  it('is positive when we are more expensive', () => {
    expect(priceGapPct(33, 30)).toBeCloseTo(0.1, 6); // 10% dearer
    expect(priceGapPct(27, 30)).toBeCloseTo(-0.1, 6); // 10% cheaper
    expect(priceGapPct(30, 30)).toBe(0);
  });

  it('never divides by a zero competitor price', () => {
    expect(priceGapPct(30, 0)).toBeNull();
    expect(priceGapPct(30, null)).toBeNull();
  });
});

describe('latest observation per competitor, per spec', () => {
  it('keeps only the most recent sighting for each competitor', () => {
    const rows = latestBySpec(
      [
        obs({ competitor: 'A', price: 31, observedOn: '2026-07-01' }),
        obs({ competitor: 'A', price: 30, observedOn: '2026-08-28' }), // newer
        obs({ competitor: 'B', price: 29, observedOn: '2026-08-01' }),
      ],
      SPEC,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.competitor === 'A')!.price).toBe(30);
  });

  it('ignores observations of a different specification', () => {
    const rows = latestBySpec(
      [obs({ specification: '7mm 200x200', competitor: 'A' }), obs({ competitor: 'B' })],
      SPEC,
    );
    expect(rows.map((r) => r.competitor)).toEqual(['B']);
  });

  it('sorts cheapest first', () => {
    const rows = latestBySpec(
      [obs({ competitor: 'A', price: 31 }), obs({ competitor: 'B', price: 28 })],
      SPEC,
    );
    expect(rows[0]!.competitor).toBe('B');
  });
});

describe('comparing our price to the market', () => {
  const market = [
    obs({ competitor: 'A', price: 30.2 }),
    obs({ competitor: 'B', price: 28.5 }),
    obs({ competitor: 'C', price: 33, specification: '7mm 200x200' }), // different spec
  ];

  it('compares only against the same specification', () => {
    const r = compareToMarket(29, SPEC, market);
    expect(r.comparisons.map((c) => c.competitor)).toEqual(['B', 'A']);
    expect(r.cheapestCompetitor).toBe('B');
  });

  it('reports the gap and who is cheaper', () => {
    const r = compareToMarket(29, SPEC, market);
    const vsA = r.comparisons.find((c) => c.competitor === 'A')!;
    expect(vsA.weAreCheaper).toBe(true);
    expect(vsA.gapPct).toBeCloseTo((29 - 30.2) / 30.2, 6);
    expect(r.weAreCheapest).toBe(false); // B undercuts us
  });

  it('says we are cheapest when nothing has been observed', () => {
    const r = compareToMarket(29, SPEC, []);
    expect(r.comparisons).toEqual([]);
    expect(r.weAreCheapest).toBe(true);
    expect(r.cheapestCompetitor).toBeNull();
  });
});

describe('head-to-head record', () => {
  it('aggregates wins and losses, biggest threat first', () => {
    const records = competitorRecords([
      obs({ competitor: 'A', dealsWonVs: 2, dealsLostTo: 1 }),
      obs({ competitor: 'A', dealsWonVs: 1, dealsLostTo: 2, observedOn: '2026-09-01' }),
      obs({ competitor: 'B', dealsWonVs: 5, dealsLostTo: 0 }),
    ]);
    const a = records.find((r) => r.competitor === 'A')!;
    expect(a.observations).toBe(2);
    expect(a.won).toBe(3);
    expect(a.lost).toBe(3);
    expect(a.winRate).toBe(0.5);
    expect(a.lastObserved).toBe('2026-09-01');
    // A has lost us more deals, so it sorts ahead of B.
    expect(records[0]!.competitor).toBe('A');
  });

  it('reports a zero win rate when nothing has been decided', () => {
    const records = competitorRecords([obs({ competitor: 'X', dealsWonVs: 0, dealsLostTo: 0 })]);
    expect(records[0]!.winRate).toBe(0);
  });
});

describe('stale intelligence', () => {
  it('flags observations older than the window', () => {
    const stale = staleObservations(
      [
        obs({ competitor: 'Old', observedOn: '2026-01-01' }),
        obs({ competitor: 'Fresh', observedOn: '2026-08-28' }),
      ],
      '2026-09-06',
      90,
    );
    expect(stale.map((o) => o.competitor)).toEqual(['Old']);
  });
});
