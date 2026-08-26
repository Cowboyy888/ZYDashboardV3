import { describe, it, expect } from 'vitest';
import {
  pctOfTarget,
  weightedScore,
  ratingForScore,
  scoreCard,
  gpTarget,
  monthlyActivity,
  impliedOrderValue,
  DEFAULT_KPI_LINES,
  KPI_RATING_LABELS,
  type KpiLine,
} from '@/lib/domain/kpi';

const line = (o: Partial<KpiLine> = {}): KpiLine => ({
  label: 'Test',
  weight: 0.3,
  target: 100,
  actual: 90,
  ...o,
});

describe('% of target (workbook E)', () => {
  it('divides actual by target', () => {
    // Sheet: GP 2,880 against 3,200 → 90%
    expect(pctOfTarget(line({ target: 3200, actual: 2880 }))).toBeCloseTo(0.9, 6);
    // Revenue 17,100 / 18,000 → 95%
    expect(pctOfTarget(line({ target: 18000, actual: 17100 }))).toBeCloseTo(0.95, 6);
    // Over-achievement exceeds 1: quotations 33 / 30 → 110%
    expect(pctOfTarget(line({ target: 30, actual: 33 }))).toBeCloseTo(1.1, 6);
  });

  it('returns null when there is no target to measure against', () => {
    expect(pctOfTarget(line({ target: null }))).toBeNull();
    expect(pctOfTarget(line({ target: 0 }))).toBeNull();
  });

  it('inverts lower-is-better lines (collections overdue)', () => {
    // Sheet row 14: target 10% overdue, actual 6% → full marks.
    expect(pctOfTarget(line({ target: 0.1, actual: 0.06, lowerIsBetter: true }))).toBe(1);
    // Exactly on target still scores full marks.
    expect(pctOfTarget(line({ target: 0.1, actual: 0.1, lowerIsBetter: true }))).toBe(1);
    // Worse than target degrades proportionally: 10% / 20% = 0.5.
    expect(pctOfTarget(line({ target: 0.1, actual: 0.2, lowerIsBetter: true }))).toBeCloseTo(
      0.5,
      6,
    );
  });
});

describe('weighted score (workbook F = B × E × 100)', () => {
  it('weights attainment into points', () => {
    expect(weightedScore(line({ weight: 0.3, target: 3200, actual: 2880 }))).toBe(27); // 0.3×0.9×100
    expect(weightedScore(line({ weight: 0.15, target: 18000, actual: 17100 }))).toBeCloseTo(
      14.25,
      2,
    );
  });

  it('is null when the line has no target', () => {
    expect(weightedScore(line({ target: null }))).toBeNull();
  });
});

describe('rating bands', () => {
  it('maps the workbook’s thresholds', () => {
    expect(ratingForScore(100)).toBe('outstanding');
    expect(ratingForScore(120)).toBe('outstanding');
    expect(ratingForScore(99)).toBe('strong');
    expect(ratingForScore(85)).toBe('strong');
    expect(ratingForScore(84)).toBe('developing');
    expect(ratingForScore(70)).toBe('developing');
    expect(ratingForScore(69)).toBe('concern');
    expect(ratingForScore(50)).toBe('concern');
    expect(ratingForScore(49)).toBe('serious');
    expect(ratingForScore(0)).toBe('serious');
  });

  it('labels ratings bilingually', () => {
    expect(KPI_RATING_LABELS.outstanding.en).toBe('Outstanding');
    expect(KPI_RATING_LABELS.serious.zh).toBe('严重');
  });
});

describe('scoring a whole card', () => {
  it('reproduces the sheet’s example card', () => {
    const r = scoreCard([
      { label: 'Gross profit', weight: 0.3, target: 3200, actual: 2880 }, // 27.00
      { label: 'Revenue', weight: 0.15, target: 18000, actual: 17100 }, // 14.25
      { label: 'New customers', weight: 0.1, target: 4, actual: 3 }, // 7.50
      { label: 'Quotations', weight: 0.1, target: 30, actual: 33 }, // 11.00
      { label: 'Activity KPI', weight: 0.1, target: 1, actual: 0.88 }, // 8.80
      { label: 'Follow-up', weight: 0.1, target: 1, actual: 0.96 }, // 9.60
      { label: 'CRM', weight: 0.05, target: 1, actual: 1 }, // 5.00
      { label: 'Overdue', weight: 0.1, target: 0.1, actual: 0.06, lowerIsBetter: true }, // 10.00
    ]);
    expect(r.totalWeight).toBe(1);
    expect(r.weightsUnbalanced).toBe(false);
    expect(r.totalScore).toBeCloseTo(93.15, 2);
    expect(r.rating).toBe('strong');
    expect(r.lines[0]!.weightedScore).toBe(27);
  });

  it('flags weights that do not sum to 1.00', () => {
    const r = scoreCard([{ label: 'Only', weight: 0.5, target: 10, actual: 10 }]);
    expect(r.totalWeight).toBe(0.5);
    expect(r.weightsUnbalanced).toBe(true);
  });

  it('ignores lines with no target when totalling', () => {
    const r = scoreCard([
      { label: 'Scored', weight: 0.5, target: 10, actual: 10 },
      { label: 'Unset', weight: 0.5, target: null, actual: null },
    ]);
    expect(r.totalScore).toBe(50);
    expect(r.lines[1]!.weightedScore).toBeNull();
  });

  it('ships the workbook’s eight default lines summing to 1.00', () => {
    expect(DEFAULT_KPI_LINES).toHaveLength(8);
    const total = DEFAULT_KPI_LINES.reduce((s, l) => s + l.weight, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(DEFAULT_KPI_LINES.find((l) => l.lowerIsBetter)?.label).toContain('Collections');
  });
});

describe('sales targets (workbook 18)', () => {
  it('derives the GP target from revenue × margin', () => {
    expect(gpTarget({ revenueTarget: 24000, targetMarginPct: 0.18 })).toBe(4320);
    expect(gpTarget({ revenueTarget: 22000, targetMarginPct: 0.21 })).toBe(4620);
    expect(gpTarget({ revenueTarget: null, targetMarginPct: 0.2 })).toBe(0);
  });

  it('converts daily/weekly activity targets into monthly equivalents', () => {
    const m = monthlyActivity({
      quotationsWeek: 7,
      qualifiedWeek: 8,
      contactsDay: 20,
      visitsDay: 6,
      leadsDay: 12,
    });
    expect(m.quotations).toBe(30); // 7 × 4.33
    expect(m.qualified).toBe(35);
    expect(m.contacts).toBe(520); // 20 × 26
    expect(m.visits).toBe(156);
    expect(m.leads).toBe(312);
  });

  it('exposes the implied average order value as a sanity check', () => {
    expect(impliedOrderValue(24000, 7)).toBeCloseTo(3428.57, 2);
    expect(impliedOrderValue(24000, 0)).toBe(0);
  });
});
