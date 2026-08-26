import { describe, it, expect } from 'vitest';
import {
  weightedValue,
  normalizeProbability,
  isOpen,
  followUpFlag,
  pipelineCoverage,
  winRate,
  summarizePipeline,
  type PipelineDeal,
} from '@/lib/domain/pipeline';

describe('weighted value (workbook O = M × N)', () => {
  it('multiplies value by probability', () => {
    // Sheet row: O-118, $7,850 at 65% → $5,102.50
    expect(weightedValue(7850, 0.65)).toBe(5102.5);
    expect(weightedValue(34200, 0.65)).toBe(22230);
    expect(weightedValue(940, 0.9)).toBe(846);
  });

  it('treats missing inputs as zero', () => {
    expect(weightedValue(null, 0.65)).toBe(0);
    expect(weightedValue(7850, null)).toBe(0);
  });

  it('accepts a probability given as a percentage', () => {
    expect(normalizeProbability(65)).toBe(0.65);
    expect(normalizeProbability(0.65)).toBe(0.65);
    expect(normalizeProbability(-1)).toBe(0);
    expect(normalizeProbability(400)).toBe(1);
    expect(weightedValue(1000, 65)).toBe(650);
  });
});

describe('open vs closed (workbook column X)', () => {
  it('is open until the stage says won or lost', () => {
    expect(isOpen('open')).toBe(true);
    expect(isOpen(null)).toBe(true); // unset stage still needs working
    expect(isOpen('won')).toBe(false);
    expect(isOpen('lost')).toBe(false);
  });
});

describe('follow-up flag (workbook column T)', () => {
  const today = '2026-09-06';

  it('flags a past date OVERDUE and the current date TODAY', () => {
    expect(followUpFlag('2026-09-05', today, 'open')).toBe('OVERDUE');
    expect(followUpFlag('2026-09-06', today, 'open')).toBe('TODAY');
    expect(followUpFlag('2026-09-07', today, 'open')).toBe('');
  });

  it('never flags a closed deal — chasing won/lost work is noise', () => {
    expect(followUpFlag('2026-09-01', today, 'won')).toBe('');
    expect(followUpFlag('2026-09-01', today, 'lost')).toBe('');
  });

  it('never flags a deal with no follow-up date set', () => {
    expect(followUpFlag(null, today, 'open')).toBe('');
  });
});

describe('coverage and win rate', () => {
  it('expresses open pipeline as a multiple of the monthly target', () => {
    expect(pipelineCoverage(110000, 55000)).toBe(2);
    expect(pipelineCoverage(55000, 55000)).toBe(1);
    expect(pipelineCoverage(0, 55000)).toBe(0);
  });

  it('returns zero coverage when no target is set (never divides by zero)', () => {
    expect(pipelineCoverage(110000, 0)).toBe(0);
  });

  it('computes win rate over decided deals only', () => {
    expect(winRate(3, 1)).toBe(0.75);
    expect(winRate(0, 0)).toBe(0);
    expect(winRate(2, 0)).toBe(1);
  });
});

describe('dashboard summary', () => {
  const deal = (o: Partial<PipelineDeal> = {}): PipelineDeal => ({
    value: 1000,
    probability: 0.5,
    category: 'open',
    stageName: '正在沟通',
    followUpDate: '2026-09-10',
    nextAction: 'Call',
    ownerId: 'dara',
    sourceId: 'facebook',
    ...o,
  });
  const today = '2026-09-06';

  it('aggregates open pipeline, weighted value and average deal size', () => {
    const s = summarizePipeline(
      [deal({ value: 7850, probability: 0.65 }), deal({ value: 940, probability: 0.9 })],
      today,
    );
    expect(s.openCount).toBe(2);
    expect(s.openValue).toBe(8790);
    expect(s.weightedValue).toBe(5948.5); // 5102.50 + 846
    expect(s.averageDealSize).toBe(4395);
  });

  it('counts the action list — the numbers the morning meeting runs on', () => {
    const s = summarizePipeline(
      [
        deal({ followUpDate: '2026-09-01' }), // overdue
        deal({ followUpDate: '2026-09-06' }), // today
        deal({ nextAction: '   ' }), // blank next action
        deal({ followUpDate: null }), // no follow-up date
      ],
      today,
    );
    expect(s.overdueFollowUps).toBe(1);
    expect(s.followUpsDueToday).toBe(1);
    expect(s.openWithNoNextAction).toBe(1);
    expect(s.openWithNoFollowUpDate).toBe(1);
  });

  it('separates won and lost results and computes the win rate', () => {
    const s = summarizePipeline(
      [
        deal({ category: 'won', value: 5000 }),
        deal({ category: 'won', value: 3000 }),
        deal({ category: 'lost', value: 2000 }),
        deal({ category: 'open', value: 1000 }),
      ],
      today,
    );
    expect(s.wonCount).toBe(2);
    expect(s.wonValue).toBe(8000);
    expect(s.lostCount).toBe(1);
    expect(s.lostValue).toBe(2000);
    expect(s.winRate).toBeCloseTo(2 / 3, 6);
    expect(s.openCount).toBe(1); // closed deals never inflate the pipeline
  });

  it('breaks the OPEN pipeline down by stage, owner and source', () => {
    const s = summarizePipeline(
      [
        deal({ ownerId: 'dara', sourceId: 'facebook', value: 5000, probability: 0.5 }),
        deal({ ownerId: 'sina', sourceId: 'facebook', value: 3000, probability: 0.5 }),
        deal({ ownerId: 'dara', sourceId: 'telegram', value: 1000, probability: 0.5 }),
        // A won deal must NOT appear in any pipeline breakdown.
        deal({ ownerId: 'dara', sourceId: 'facebook', value: 9999, category: 'won' }),
      ],
      today,
    );
    expect(s.byOwner.find((r) => r.key === 'dara')).toEqual({
      key: 'dara',
      deals: 2,
      value: 6000,
      weighted: 3000,
    });
    expect(s.bySource.find((r) => r.key === 'facebook')?.value).toBe(8000);
    expect(s.byStage[0]!.deals).toBe(3);
  });

  it('groups unassigned owners and sources under a placeholder', () => {
    const s = summarizePipeline([deal({ ownerId: null, sourceId: null, stageName: null })], today);
    expect(s.byOwner[0]!.key).toBe('—');
    expect(s.bySource[0]!.key).toBe('—');
    expect(s.byStage[0]!.key).toBe('—');
  });

  it('handles an empty pipeline without dividing by zero', () => {
    const s = summarizePipeline([], today);
    expect(s.openCount).toBe(0);
    expect(s.averageDealSize).toBe(0);
    expect(s.winRate).toBe(0);
    expect(s.byOwner).toEqual([]);
  });
});
