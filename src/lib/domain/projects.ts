/**
 * Construction project database — pure, no-I/O (toolkit sheet 13).
 *
 * "Find projects BEFORE they buy. A piling rig on site means mesh will be
 * bought within months." Mesh and rebar go in at foundation and slab stage, so
 * the construction stage is a demand clock: it says roughly how long until the
 * project buys, which is what turns a list of sites into a pipeline of future
 * demand.
 */

export const CONSTRUCTION_STAGES = [
  'land_permit',
  'site_clearing',
  'piling',
  'foundation',
  'slabs',
  'structure',
  'finishing',
  'complete',
] as const;
export type ConstructionStage = (typeof CONSTRUCTION_STAGES)[number];

export const STAGE_LABELS: Record<ConstructionStage, { en: string; zh: string }> = {
  land_permit: { en: 'Land / permit', zh: '土地 / 许可' },
  site_clearing: { en: 'Site clearing', zh: '场地清理' },
  piling: { en: 'Piling', zh: '打桩' },
  foundation: { en: 'Foundation', zh: '基础' },
  slabs: { en: 'Slabs', zh: '楼板' },
  structure: { en: 'Structure', zh: '主体结构' },
  finishing: { en: 'Finishing', zh: '装修' },
  complete: { en: 'Complete', zh: '已完工' },
};

/** Position in the build sequence (0 = earliest). */
export function stageOrder(stage: ConstructionStage): number {
  return CONSTRUCTION_STAGES.indexOf(stage);
}

/**
 * Rough months until this project buys mesh, by stage. Steel goes in at
 * foundation/slab, so piling is the moment to be in the conversation and
 * foundation/slabs are buying now. Later stages have already bought.
 */
export const MONTHS_TO_PURCHASE: Record<ConstructionStage, number | null> = {
  land_permit: 9,
  site_clearing: 6,
  piling: 3,
  foundation: 1,
  slabs: 0, // buying now
  structure: 0, // may still top up
  finishing: null, // too late
  complete: null,
};

export type BuyingWindow = 'buying_now' | 'imminent' | 'upcoming' | 'early' | 'passed';

/**
 * Bucket a project by how close it is to purchasing — the field team's
 * priority order.
 */
export function buyingWindow(stage: ConstructionStage): BuyingWindow {
  const months = MONTHS_TO_PURCHASE[stage];
  if (months == null) return 'passed';
  if (months === 0) return 'buying_now';
  if (months <= 3) return 'imminent';
  if (months <= 6) return 'upcoming';
  return 'early';
}

export const BUYING_WINDOW_LABELS: Record<BuyingWindow, { en: string; zh: string }> = {
  buying_now: { en: 'Buying now', zh: '正在采购' },
  imminent: { en: 'Within 3 months', zh: '三个月内' },
  upcoming: { en: 'Within 6 months', zh: '六个月内' },
  early: { en: 'Early stage', zh: '早期阶段' },
  passed: { en: 'Passed', zh: '已错过' },
};

/** True when a project is worth working right now. */
export function isActionable(stage: ConstructionStage): boolean {
  const w = buyingWindow(stage);
  return w === 'buying_now' || w === 'imminent';
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface ProjectLike {
  stage: ConstructionStage;
  estimatedValue: number | null;
  estimatedTonnage: number | null;
  expectedPurchaseMonth: string | null;
  nextActionDate: string | null;
  salespersonId: string | null;
}

export interface ProjectRollup {
  key: string;
  projects: number;
  value: number;
  tonnage: number;
}

export interface ProjectSummary {
  total: number;
  totalValue: number;
  totalTonnage: number;
  /** Projects at foundation/slab — the ones to call today. */
  actionable: number;
  actionableValue: number;
  /** Projects with no next action date — invisible work. */
  missingNextAction: number;
  /** Next action date already past. */
  overdueActions: number;
  byWindow: ProjectRollup[];
  byStage: ProjectRollup[];
  byMonth: ProjectRollup[];
}

function push(map: Map<string, ProjectRollup>, key: string, value: number, tonnage: number) {
  const r = map.get(key) ?? { key, projects: 0, value: 0, tonnage: 0 };
  r.projects += 1;
  r.value = round2(r.value + value);
  r.tonnage = round2(r.tonnage + tonnage);
  map.set(key, r);
}

/** Summarise the project database into future demand + an action list. */
export function summarizeProjects(projects: ProjectLike[], today: string): ProjectSummary {
  const byWindow = new Map<string, ProjectRollup>();
  const byStage = new Map<string, ProjectRollup>();
  const byMonth = new Map<string, ProjectRollup>();

  let totalValue = 0;
  let totalTonnage = 0;
  let actionable = 0;
  let actionableValue = 0;
  let missingNextAction = 0;
  let overdueActions = 0;

  for (const p of projects) {
    const value = num(p.estimatedValue);
    const tonnage = num(p.estimatedTonnage);
    totalValue += value;
    totalTonnage += tonnage;

    if (isActionable(p.stage)) {
      actionable += 1;
      actionableValue += value;
    }
    if (!p.nextActionDate) missingNextAction += 1;
    else if (p.nextActionDate < today) overdueActions += 1;

    push(byWindow, buyingWindow(p.stage), value, tonnage);
    push(byStage, p.stage, value, tonnage);
    push(byMonth, p.expectedPurchaseMonth ?? '—', value, tonnage);
  }

  return {
    total: projects.length,
    totalValue: round2(totalValue),
    totalTonnage: round2(totalTonnage),
    actionable,
    actionableValue: round2(actionableValue),
    missingNextAction,
    overdueActions,
    byWindow: [...byWindow.values()].sort((a, b) => b.value - a.value),
    byStage: [...byStage.values()].sort(
      (a, b) => stageOrder(a.key as ConstructionStage) - stageOrder(b.key as ConstructionStage),
    ),
    // Dated months in order; projects with no expected purchase month last —
    // they are unscheduled demand, not the earliest demand.
    byMonth: [...byMonth.values()].sort((a, b) => {
      if (a.key === '—') return 1;
      if (b.key === '—') return -1;
      return a.key.localeCompare(b.key);
    }),
  };
}
