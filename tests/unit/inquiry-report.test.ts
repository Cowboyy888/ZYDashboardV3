import { describe, it, expect } from 'vitest';
import {
  INQUIRY_REPORT_COLUMNS,
  toReportRow,
  cellText,
  formatUsd,
  formatNum,
  buildInquiryReportHtml,
  type InquiryReportResolvers,
} from '@/lib/reports/inquiry-report-html';
import { summarizeInquiries } from '@/lib/domain/sales-inquiry';
import type { SalesInquiryRow } from '@/lib/db/types';

const resolvers: InquiryReportResolvers = {
  salespersonName: (id) => (id === 'ash' ? '啊山' : ''),
  typeName: (id) => (id === 'dist' ? '中间商(Distributor)' : ''),
  familyName: (id) => (id === 'mesh' ? '钢筋网' : ''),
  status: (id) => (id === 'won' ? { name: '成交', category: 'won' } : null),
};

const inquiry = (o: Partial<SalesInquiryRow> = {}): SalesInquiryRow =>
  ({
    id: 'i1',
    inquiry_no: 'ZY-2026-001',
    inquiry_date: '2026-07-21',
    salesperson_id: 'ash',
    customer_id: null,
    customer_name: 'Galleria Tile',
    company_name: 'Galleria Tile Depot',
    contact: null,
    customer_type_id: 'dist',
    family_id: 'mesh',
    specification: '3.2m*6m',
    diameter: '7.2mm',
    sheet_size: null,
    area_per_sheet: 3,
    mesh_opening: '200*200',
    quantity: 100,
    delivery_location: '金边',
    factory_cost: 1.5,
    quoted_price: 1.83,
    target_price: 1.7,
    final_price: null,
    status_id: 'won',
    follow_up_date: '2026-07-23',
    follow_up_notes: null,
    next_action: null,
    remarks: null,
    price_difference: 0.13,
    quotation_value: 549,
    estimated_profit: 99,
    created_by: null,
    created_at: '',
    updated_at: '',
    ...o,
  }) as SalesInquiryRow;

describe('report cell formatting', () => {
  it('formats USD and numbers, blanks as em dash', () => {
    expect(formatUsd(1.8)).toBe('$1.80');
    expect(formatUsd(null)).toBe('—');
    expect(formatNum(489)).toBe('489');
    expect(formatNum(null)).toBe('—');
    expect(cellText('金边', 'text')).toBe('金边');
    expect(cellText(null, 'text')).toBe('—');
    expect(cellText(0.13, 'usd')).toBe('$0.13');
  });
});

describe('toReportRow', () => {
  it('maps a DB inquiry to display values incl. derived columns', () => {
    const row = toReportRow(inquiry(), resolvers);
    expect(row.no).toBe('ZY-2026-001');
    expect(row.salesperson).toBe('啊山');
    expect(row.type).toBe('中间商(Distributor)');
    expect(row.product).toBe('钢筋网');
    expect(row.status).toBe('成交');
    expect(row.diff).toBe(0.13);
    expect(row.profit).toBe(99);
  });

  it('has a stable, complete column set', () => {
    const keys = INQUIRY_REPORT_COLUMNS.map((c) => c.key);
    expect(keys).toContain('quoted');
    expect(keys).toContain('profit');
    expect(new Set(keys).size).toBe(keys.length); // unique
  });
});

describe('buildInquiryReportHtml', () => {
  const summary = summarizeInquiries([
    {
      factoryCost: 1.5,
      quotedPrice: 1.83,
      targetPrice: 1.7,
      finalPrice: null,
      areaPerSheet: 3,
      quantity: 100,
      statusCategory: 'won',
      familyId: 'mesh',
      salespersonId: 'ash',
    },
  ]);

  it('produces a branded, self-contained HTML document with the data', () => {
    const html = buildInquiryReportHtml({
      generatedOn: '21/07/2026',
      summary,
      rows: [toReportRow(inquiry(), resolvers)],
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    // Letterhead matches the printed invoice: "ZY STEEL" over 中粤铁网.
    expect(html).toContain('ZY STEEL');
    expect(html).toContain('中粤铁网');
    expect(html).toContain('Steel Mesh &amp; Wire Drawing Manufacturer');
    expect(html).toContain('CUSTOMER PRICE INQUIRY REPORT');
    expect(html).toContain('print-color-adjust: exact');
    expect(html).toContain('Galleria Tile'); // a data row
    expect(html).toContain('21/07/2026'); // generated date
    expect(html).toContain('Thank you for your business'); // red footer strip
  });

  it('escapes HTML-special characters in data', () => {
    const html = buildInquiryReportHtml({
      generatedOn: '21/07/2026',
      summary,
      rows: [toReportRow(inquiry({ customer_name: 'A & B <Co>' }), resolvers)],
    });
    expect(html).toContain('A &amp; B &lt;Co&gt;');
    expect(html).not.toContain('A & B <Co>');
  });

  it('renders an empty-state row when there are no inquiries', () => {
    const html = buildInquiryReportHtml({
      generatedOn: '21/07/2026',
      summary: summarizeInquiries([]),
      rows: [],
    });
    expect(html).toContain('No records for this report');
  });
});
