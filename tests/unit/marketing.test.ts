import { describe, it, expect } from 'vitest';
import {
  totalLeads,
  costPerLead,
  leadQuality,
  costPerQualifiedLead,
  costPerOrder,
  attributedGrossProfit,
  returnOnAdSpend,
  contentCompliance,
  channelMix,
  summarizeMarketing,
  LEAD_CHANNELS,
  LEAD_CHANNEL_LABELS,
  type DailyMarketing,
} from '@/lib/domain/marketing';

const day = (o: Partial<DailyMarketing> = {}): DailyMarketing => ({
  businessDate: '2026-09-04',
  postsPublished: 2,
  postsPlanned: 2,
  facebookLeads: 6,
  tiktokLeads: 1,
  telegramLeads: 2,
  googleLeads: 1,
  websiteLeads: 0,
  medianResponseMin: 14,
  adSpend: 11,
  ...o,
});

describe('total leads (workbook I = SUM(D:H))', () => {
  it('sums every channel', () => {
    expect(totalLeads(day())).toBe(10); // 6+1+2+1+0
  });

  it('treats missing channels as zero', () => {
    expect(totalLeads(day({ facebookLeads: null, tiktokLeads: null }))).toBe(3);
  });
});

describe('cost ratios — null, never zero, when the denominator is missing', () => {
  it('computes cost per lead (workbook L)', () => {
    expect(costPerLead(11, 10)).toBe(1.1);
    // Sheet 08: $310 spend / 142 leads → $2.18
    expect(costPerLead(310, 142)).toBe(2.18);
  });

  it('returns null for cost per lead when no leads came in', () => {
    // Zero would read as "free leads" rather than "no leads".
    expect(costPerLead(310, 0)).toBeNull();
    expect(costPerLead(310, null)).toBeNull();
  });

  it('computes lead quality and cost per QUALIFIED lead', () => {
    // Sheet 08: 47 qualified of 142 → 33%;  $310 / 47 → $6.60
    expect(leadQuality(47, 142)).toBeCloseTo(0.330986, 5);
    expect(costPerQualifiedLead(310, 47)).toBe(6.6);
    expect(costPerQualifiedLead(310, 0)).toBeNull();
  });

  it('computes cost per order', () => {
    expect(costPerOrder(310, 5)).toBe(62); // $310 / 5 orders
    expect(costPerOrder(310, 0)).toBeNull();
  });
});

describe('attributed gross profit and ROAS', () => {
  it('applies the margin assumption to revenue (workbook L = J × B41)', () => {
    expect(attributedGrossProfit(14800, 0.18)).toBe(2664);
    expect(attributedGrossProfit(null, 0.18)).toBe(0);
  });

  it('computes return on ad spend (workbook M)', () => {
    // $2,664 gross profit on $310 spend → 8.6×
    expect(returnOnAdSpend(2664, 310)).toBeCloseTo(8.593548, 5);
  });

  it('returns null ROAS when nothing was spent', () => {
    expect(returnOnAdSpend(2664, 0)).toBeNull();
  });
});

describe('content compliance (workbook Q)', () => {
  it('divides published by planned', () => {
    expect(contentCompliance(28, 30)).toBeCloseTo(0.933333, 5);
    expect(contentCompliance(30, 30)).toBe(1);
  });

  it('is null when nothing was planned', () => {
    expect(contentCompliance(5, 0)).toBeNull();
  });
});

describe('channel mix', () => {
  it('ranks channels by volume with their share', () => {
    const mix = channelMix([day(), day({ facebookLeads: 4, tiktokLeads: 5 })]);
    expect(mix[0]!.channel).toBe('facebook');
    expect(mix[0]!.leads).toBe(10);
    const total = mix.reduce((s, c) => s + c.leads, 0);
    expect(total).toBe(22);
    expect(mix[0]!.share).toBeCloseTo(10 / 22, 6);
  });

  it('lists every channel even at zero, so a dead channel stays visible', () => {
    const mix = channelMix([]);
    expect(mix).toHaveLength(LEAD_CHANNELS.length);
    expect(mix.every((c) => c.leads === 0 && c.share === 0)).toBe(true);
  });

  it('labels every channel', () => {
    expect(LEAD_CHANNEL_LABELS.website.zh).toBe('官网');
  });
});

describe('monthly marketing summary', () => {
  const rows = [day({ adSpend: 155 }), day({ businessDate: '2026-09-05', adSpend: 155 })];

  it('rolls spend, leads and content up and derives every KPI', () => {
    const s = summarizeMarketing(rows, { qualifiedLeads: 8, orders: 2, revenue: 14800 }, 0.18);
    expect(s.days).toBe(2);
    expect(s.adSpend).toBe(310);
    expect(s.leads).toBe(20);
    expect(s.costPerLead).toBe(15.5);
    expect(s.leadQuality).toBeCloseTo(0.4, 6);
    expect(s.costPerQualifiedLead).toBe(38.75);
    expect(s.costPerOrder).toBe(155);
    expect(s.grossProfit).toBe(2664);
    expect(s.returnOnAdSpend).toBeCloseTo(8.593548, 5);
    expect(s.contentCompliance).toBe(1);
  });

  it('averages only the days that reported a response time', () => {
    const s = summarizeMarketing([
      day({ medianResponseMin: 10 }),
      day({ medianResponseMin: null }),
      day({ medianResponseMin: 20 }),
    ]);
    expect(s.medianResponseMin).toBe(15); // not 10
  });

  it('leaves outcome-dependent KPIs null when the CRM supplies nothing', () => {
    const s = summarizeMarketing(rows);
    expect(s.qualifiedLeads).toBeNull();
    expect(s.leadQuality).toBeNull();
    expect(s.costPerQualifiedLead).toBeNull();
    expect(s.costPerOrder).toBeNull();
    expect(s.costPerLead).toBe(15.5); // still knowable
  });

  it('handles an empty month', () => {
    const s = summarizeMarketing([]);
    expect(s.days).toBe(0);
    expect(s.leads).toBe(0);
    expect(s.costPerLead).toBeNull();
    expect(s.medianResponseMin).toBeNull();
  });
});
