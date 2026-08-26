import { describe, it, expect } from 'vitest';
import {
  stageOrder,
  buyingWindow,
  isActionable,
  summarizeProjects,
  CONSTRUCTION_STAGES,
  STAGE_LABELS,
  BUYING_WINDOW_LABELS,
  type ProjectLike,
} from '@/lib/domain/projects';

const project = (o: Partial<ProjectLike> = {}): ProjectLike => ({
  stage: 'piling',
  estimatedValue: 46000,
  estimatedTonnage: 90,
  expectedPurchaseMonth: '2026-11',
  nextActionDate: '2026-09-11',
  salespersonId: 'dara',
  ...o,
});

describe('construction stages', () => {
  it('orders stages in build sequence', () => {
    expect(stageOrder('land_permit')).toBe(0);
    expect(stageOrder('piling')).toBeLessThan(stageOrder('foundation'));
    expect(stageOrder('foundation')).toBeLessThan(stageOrder('slabs'));
    expect(stageOrder('complete')).toBe(CONSTRUCTION_STAGES.length - 1);
  });

  it('labels every stage bilingually', () => {
    for (const s of CONSTRUCTION_STAGES) {
      expect(STAGE_LABELS[s].en.length).toBeGreaterThan(0);
      expect(STAGE_LABELS[s].zh.length).toBeGreaterThan(0);
    }
    expect(STAGE_LABELS.piling.zh).toBe('打桩');
  });
});

describe('buying window — the demand clock', () => {
  it('treats slab/structure stage as buying now', () => {
    expect(buyingWindow('slabs')).toBe('buying_now');
    expect(buyingWindow('structure')).toBe('buying_now');
  });

  it('treats piling and foundation as imminent — the moment to be in the room', () => {
    expect(buyingWindow('piling')).toBe('imminent');
    expect(buyingWindow('foundation')).toBe('imminent');
  });

  it('treats early stages as upcoming or early', () => {
    expect(buyingWindow('site_clearing')).toBe('upcoming');
    expect(buyingWindow('land_permit')).toBe('early');
  });

  it('treats finishing and complete as passed', () => {
    expect(buyingWindow('finishing')).toBe('passed');
    expect(buyingWindow('complete')).toBe('passed');
  });

  it('marks only buying-now and imminent projects actionable', () => {
    expect(isActionable('slabs')).toBe(true);
    expect(isActionable('piling')).toBe(true);
    expect(isActionable('site_clearing')).toBe(false);
    expect(isActionable('finishing')).toBe(false);
  });

  it('labels every window bilingually', () => {
    expect(BUYING_WINDOW_LABELS.buying_now.en).toBe('Buying now');
    expect(BUYING_WINDOW_LABELS.passed.zh).toBe('已错过');
  });
});

describe('project summary', () => {
  const today = '2026-09-15';

  it('totals future demand and flags the actionable slice', () => {
    const s = summarizeProjects(
      [
        project({ stage: 'slabs', estimatedValue: 10000, estimatedTonnage: 20 }),
        project({ stage: 'piling', estimatedValue: 46000, estimatedTonnage: 90 }),
        project({ stage: 'land_permit', estimatedValue: 5000, estimatedTonnage: 10 }),
        project({ stage: 'finishing', estimatedValue: 1000, estimatedTonnage: 2 }),
      ],
      today,
    );
    expect(s.total).toBe(4);
    expect(s.totalValue).toBe(62000);
    expect(s.totalTonnage).toBe(122);
    expect(s.actionable).toBe(2); // slabs + piling
    expect(s.actionableValue).toBe(56000);
  });

  it('counts projects with no next action and overdue actions', () => {
    const s = summarizeProjects(
      [
        project({ nextActionDate: null }),
        project({ nextActionDate: '2026-09-01' }), // overdue
        project({ nextActionDate: '2026-09-30' }), // future
      ],
      today,
    );
    expect(s.missingNextAction).toBe(1);
    expect(s.overdueActions).toBe(1);
  });

  it('breaks down by window, stage (in build order) and purchase month', () => {
    const s = summarizeProjects(
      [
        project({ stage: 'slabs', expectedPurchaseMonth: '2026-10' }),
        project({ stage: 'piling', expectedPurchaseMonth: '2026-11' }),
        project({ stage: 'land_permit', expectedPurchaseMonth: null }),
      ],
      today,
    );
    expect(s.byStage.map((r) => r.key)).toEqual(['land_permit', 'piling', 'slabs']);
    expect(s.byMonth.map((r) => r.key)).toEqual(['2026-10', '2026-11', '—']);
    expect(s.byWindow.find((r) => r.key === 'buying_now')?.projects).toBe(1);
  });

  it('handles an empty database', () => {
    const s = summarizeProjects([], today);
    expect(s.total).toBe(0);
    expect(s.totalValue).toBe(0);
    expect(s.byStage).toEqual([]);
  });
});
