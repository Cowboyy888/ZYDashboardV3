import { describe, expect, it } from 'vitest';
import { buildWireMeshDrawingHtml } from '@/lib/reports/wire-mesh-drawing-html';
import type { WireMeshDrawingRow } from '@/lib/db/types';

const drawing: WireMeshDrawingRow = {
  id: 'drawing-1',
  quotation_id: 'quotation-1',
  sales_order_id: null,
  customer_name: 'Acme',
  mesh_specification: 'A8',
  wire_diameter_mm: 6,
  sheet_length_mm: 3000,
  sheet_width_mm: 1500,
  length_spacing_mm: 200,
  width_spacing_mm: 200,
  overhang_left_mm: 100,
  overhang_right_mm: 100,
  overhang_top_mm: 50,
  overhang_bottom_mm: 50,
  quantity: 3,
  created_by: null,
  updated_by: null,
  created_at: '2026-10-27T00:00:00Z',
  updated_at: '2026-10-27T00:00:00Z',
};

describe('buildWireMeshDrawingHtml', () => {
  it('includes the full SVG grid and derived order details in an A4 landscape document', () => {
    const html = buildWireMeshDrawingHtml(drawing, 'Q-001');
    expect(html).toContain('<svg viewBox="0 0 1000 480">');
    expect(html).toContain('Length 3000 mm');
    expect(html).toContain('15 across length · 8 across width');
    expect(html).toContain('13.500 m²');
    expect(html).toContain('@page{size:A4 landscape');
  });
});
