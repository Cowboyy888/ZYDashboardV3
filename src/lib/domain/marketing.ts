/**
 * Marketing KPI — pure, no-I/O (toolkit sheets 02 and 08).
 *
 *   total leads            I = SUM(channel leads)
 *   cost per lead          D = spend / leads
 *   lead quality           F = qualified / leads
 *   cost per QUALIFIED     G = spend / qualified
 *   cost per order         K = spend / orders
 *   gross profit           L = revenue × margin assumption
 *   return on ad spend     M = gross profit / spend
 *   content published      Q = published / planned
 *
 * "Cost per QUALIFIED lead and cost per order are the numbers that matter" —
 * cost per raw lead flatters a channel that produces volume nobody can sell to.
 *
 * Every ratio returns null rather than 0 when its denominator is missing: no
 * leads is not the same as free leads, and the difference matters when the
 * number is used to cut or keep a channel's budget.
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const num = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/**
 * Divide, or null when either side is unknown or the denominator is zero.
 * Unknown in, unknown out: a missing numerator must not read as a real zero —
 * "we have not counted qualified leads" is not "none of the leads qualified",
 * and the two lead to opposite budget decisions. A numerator that IS zero is a
 * known value and divides normally.
 */
function ratio(numerator: number | null | undefined, denominator: number | null): number | null {
  if (numerator == null) return null;
  const d = num(denominator);
  if (d === 0) return null;
  return num(numerator) / d;
}

export const LEAD_CHANNELS = ['facebook', 'tiktok', 'telegram', 'google', 'website'] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, { en: string; zh: string }> = {
  facebook: { en: 'Facebook', zh: 'Facebook' },
  tiktok: { en: 'TikTok', zh: 'TikTok' },
  telegram: { en: 'Telegram', zh: 'Telegram' },
  google: { en: 'Google', zh: 'Google' },
  website: { en: 'Website', zh: '官网' },
};

export interface DailyMarketing {
  businessDate: string;
  postsPublished: number | null;
  postsPlanned: number | null;
  facebookLeads: number | null;
  tiktokLeads: number | null;
  telegramLeads: number | null;
  googleLeads: number | null;
  websiteLeads: number | null;
  medianResponseMin: number | null;
  adSpend: number | null;
}

/** `I = SUM(D:H)`. */
export function totalLeads(d: DailyMarketing): number {
  return (
    num(d.facebookLeads) +
    num(d.tiktokLeads) +
    num(d.telegramLeads) +
    num(d.googleLeads) +
    num(d.websiteLeads)
  );
}

/** `D = spend / leads`. Null when no leads came in. */
export function costPerLead(adSpend: number | null, leads: number | null): number | null {
  const r = ratio(adSpend, leads);
  return r == null ? null : round2(r);
}

/** `F = qualified / leads` — what share of the volume was actually sellable. */
export function leadQuality(qualified: number | null, leads: number | null): number | null {
  return ratio(qualified, leads);
}

/** `G = spend / qualified` — the number that decides a channel's budget. */
export function costPerQualifiedLead(
  adSpend: number | null,
  qualified: number | null,
): number | null {
  const r = ratio(adSpend, qualified);
  return r == null ? null : round2(r);
}

/** `K = spend / orders`. */
export function costPerOrder(adSpend: number | null, orders: number | null): number | null {
  const r = ratio(adSpend, orders);
  return r == null ? null : round2(r);
}

/** `L = revenue × margin assumption` — marketing-attributed gross profit. */
export function attributedGrossProfit(revenue: number | null, marginAssumption: number): number {
  return round2(num(revenue) * num(marginAssumption));
}

/** `M = gross profit / spend`. Null when nothing was spent. */
export function returnOnAdSpend(grossProfit: number | null, adSpend: number | null): number | null {
  return ratio(grossProfit, adSpend);
}

/** `Q = published / planned` — did marketing do what it said it would. */
export function contentCompliance(published: number | null, planned: number | null): number | null {
  return ratio(published, planned);
}

export interface ChannelRollup {
  channel: LeadChannel;
  leads: number;
  share: number;
}

/** Lead mix by channel, biggest first, with each channel's share of the total. */
export function channelMix(rows: DailyMarketing[]): ChannelRollup[] {
  const totals: Record<LeadChannel, number> = {
    facebook: 0,
    tiktok: 0,
    telegram: 0,
    google: 0,
    website: 0,
  };
  for (const r of rows) {
    totals.facebook += num(r.facebookLeads);
    totals.tiktok += num(r.tiktokLeads);
    totals.telegram += num(r.telegramLeads);
    totals.google += num(r.googleLeads);
    totals.website += num(r.websiteLeads);
  }
  const grand = LEAD_CHANNELS.reduce((s, c) => s + totals[c], 0);
  return LEAD_CHANNELS.map((channel) => ({
    channel,
    leads: totals[channel],
    share: grand > 0 ? totals[channel] / grand : 0,
  })).sort((a, b) => b.leads - a.leads);
}

export interface MarketingPeriod {
  days: number;
  adSpend: number;
  leads: number;
  qualifiedLeads: number | null;
  orders: number | null;
  revenue: number | null;
  postsPublished: number;
  postsPlanned: number;
  /** Mean of the daily medians actually reported (days without one ignored). */
  medianResponseMin: number | null;
  costPerLead: number | null;
  leadQuality: number | null;
  costPerQualifiedLead: number | null;
  costPerOrder: number | null;
  grossProfit: number;
  returnOnAdSpend: number | null;
  contentCompliance: number | null;
  channels: ChannelRollup[];
}

export interface MarketingOutcomes {
  qualifiedLeads?: number | null;
  orders?: number | null;
  revenue?: number | null;
}

/**
 * Roll dailies into the monthly marketing KPI row. Outcomes (qualified leads,
 * orders, revenue) come from the CRM rather than the marketing sheet, so they
 * are passed in.
 */
export function summarizeMarketing(
  rows: DailyMarketing[],
  outcomes: MarketingOutcomes = {},
  marginAssumption = 0.18,
): MarketingPeriod {
  let adSpend = 0;
  let leads = 0;
  let published = 0;
  let planned = 0;
  const responses: number[] = [];

  for (const r of rows) {
    adSpend += num(r.adSpend);
    leads += totalLeads(r);
    published += num(r.postsPublished);
    planned += num(r.postsPlanned);
    if (r.medianResponseMin != null) responses.push(num(r.medianResponseMin));
  }

  const revenue = outcomes.revenue ?? null;
  const gp = attributedGrossProfit(revenue, marginAssumption);

  return {
    days: rows.length,
    adSpend: round2(adSpend),
    leads,
    qualifiedLeads: outcomes.qualifiedLeads ?? null,
    orders: outcomes.orders ?? null,
    revenue,
    postsPublished: published,
    postsPlanned: planned,
    medianResponseMin:
      responses.length > 0 ? round2(responses.reduce((s, v) => s + v, 0) / responses.length) : null,
    costPerLead: costPerLead(adSpend, leads),
    leadQuality: leadQuality(outcomes.qualifiedLeads ?? null, leads),
    costPerQualifiedLead: costPerQualifiedLead(adSpend, outcomes.qualifiedLeads ?? null),
    costPerOrder: costPerOrder(adSpend, outcomes.orders ?? null),
    grossProfit: gp,
    returnOnAdSpend: returnOnAdSpend(gp, adSpend),
    contentCompliance: contentCompliance(published, planned),
    channels: channelMix(rows),
  };
}
