/**
 * CRM pipeline — pure, no-I/O logic behind the morning dashboard.
 *
 * Transcribed from sheet 06 (CRM Pipeline) and the Dashboard of the ZY Steel
 * Sales & Marketing Toolkit:
 *
 *   Weighted value  O = M × N                 value × probability
 *   Overdue flag    T = IF(S < TODAY, "OVERDUE", IF(S = TODAY, "TODAY", ""))
 *   Open / Closed   X = stage 8+ or Lost → Closed, else Open
 *   Win rate        won / (won + lost)
 *   Coverage        open pipeline value / monthly target
 *
 * The workbook's action list is the point of the whole thing: a deal with no
 * dated next action is invisible work, so `summarizePipeline` counts those
 * explicitly (overdue follow-ups target ZERO).
 */

/** How a stage classifies a deal. Mirrors inquiry_statuses.category. */
export type StageCategory = 'open' | 'won' | 'lost';

/** Workbook column T. Empty string means "nothing to flag". */
export type FollowUpFlag = 'OVERDUE' | 'TODAY' | '';

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/** Clamp a probability to 0–1, accepting 65 as 65%. */
export function normalizeProbability(p: number | null | undefined): number {
  const v = num(p);
  const share = v > 1 ? v / 100 : v;
  return Math.min(1, Math.max(0, share));
}

/** `O = M × N` — the weighted (probability-adjusted) value of a deal. */
export function weightedValue(value: number | null, probability: number | null): number {
  return round2(num(value) * normalizeProbability(probability));
}

/** A deal is Open until its stage says it is won or lost. */
export function isOpen(category: StageCategory | null): boolean {
  return category !== 'won' && category !== 'lost';
}

/**
 * Workbook column T. A closed deal never flags — chasing a won or lost deal is
 * noise. Dates are ISO `YYYY-MM-DD`, compared as strings (safe for ISO dates).
 */
export function followUpFlag(
  followUpDate: string | null,
  today: string,
  category: StageCategory | null,
): FollowUpFlag {
  if (!followUpDate || !isOpen(category)) return '';
  if (followUpDate < today) return 'OVERDUE';
  if (followUpDate === today) return 'TODAY';
  return '';
}

/** Pipeline coverage as a multiple of the target (0 when no target is set). */
export function pipelineCoverage(openValue: number, monthlyTarget: number): number {
  if (num(monthlyTarget) <= 0) return 0;
  return round2(num(openValue) / num(monthlyTarget));
}

/** won / (won + lost); 0 when nothing has been decided yet. */
export function winRate(won: number, lost: number): number {
  const decided = num(won) + num(lost);
  return decided > 0 ? num(won) / decided : 0;
}

// --- Dashboard summary ---------------------------------------------------------

/** The minimum each deal must expose for the dashboard to classify it. */
export interface PipelineDeal {
  value: number | null;
  probability: number | null;
  category: StageCategory | null;
  /** Stage display name, for the stage breakdown. */
  stageName: string | null;
  followUpDate: string | null;
  nextAction: string | null;
  ownerId: string | null;
  sourceId: string | null;
}

export interface PipelineRollup {
  key: string;
  deals: number;
  value: number;
  weighted: number;
}

export interface PipelineSummary {
  /** Open deals only. */
  openCount: number;
  openValue: number;
  weightedValue: number;
  averageDealSize: number;
  /** Action list — the numbers the morning meeting runs on. */
  overdueFollowUps: number;
  followUpsDueToday: number;
  openWithNoNextAction: number;
  openWithNoFollowUpDate: number;
  /** Results. */
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  winRate: number;
  byStage: PipelineRollup[];
  byOwner: PipelineRollup[];
  bySource: PipelineRollup[];
}

function push(map: Map<string, PipelineRollup>, key: string, value: number, weighted: number) {
  const r = map.get(key) ?? { key, deals: 0, value: 0, weighted: 0 };
  r.deals += 1;
  r.value = round2(r.value + value);
  r.weighted = round2(r.weighted + weighted);
  map.set(key, r);
}

/**
 * Aggregate the pipeline for the dashboard. `today` is passed in (never read
 * from the clock here) so the result is deterministic and testable.
 */
export function summarizePipeline(deals: PipelineDeal[], today: string): PipelineSummary {
  const byStage = new Map<string, PipelineRollup>();
  const byOwner = new Map<string, PipelineRollup>();
  const bySource = new Map<string, PipelineRollup>();

  let openCount = 0;
  let openValue = 0;
  let weighted = 0;
  let overdue = 0;
  let dueToday = 0;
  let noAction = 0;
  let noDate = 0;
  let wonCount = 0;
  let wonValue = 0;
  let lostCount = 0;
  let lostValue = 0;

  for (const d of deals) {
    const value = num(d.value);
    const w = weightedValue(value, d.probability);
    const open = isOpen(d.category);

    if (open) {
      openCount += 1;
      openValue += value;
      weighted += w;

      const flag = followUpFlag(d.followUpDate, today, d.category);
      if (flag === 'OVERDUE') overdue += 1;
      if (flag === 'TODAY') dueToday += 1;
      if (!d.nextAction || d.nextAction.trim() === '') noAction += 1;
      if (!d.followUpDate) noDate += 1;

      // Only open deals belong in a pipeline breakdown.
      push(byStage, d.stageName?.trim() || '—', value, w);
      push(byOwner, d.ownerId ?? '—', value, w);
      push(bySource, d.sourceId ?? '—', value, w);
    } else if (d.category === 'won') {
      wonCount += 1;
      wonValue += value;
    } else {
      lostCount += 1;
      lostValue += value;
    }
  }

  const byValue = (a: PipelineRollup, b: PipelineRollup) => b.value - a.value;
  return {
    openCount,
    openValue: round2(openValue),
    weightedValue: round2(weighted),
    averageDealSize: openCount > 0 ? round2(openValue / openCount) : 0,
    overdueFollowUps: overdue,
    followUpsDueToday: dueToday,
    openWithNoNextAction: noAction,
    openWithNoFollowUpDate: noDate,
    wonCount,
    wonValue: round2(wonValue),
    lostCount,
    lostValue: round2(lostValue),
    winRate: winRate(wonCount, lostCount),
    byStage: [...byStage.values()].sort(byValue),
    byOwner: [...byOwner.values()].sort(byValue),
    bySource: [...bySource.values()].sort(byValue),
  };
}
