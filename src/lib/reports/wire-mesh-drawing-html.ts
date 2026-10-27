import type { WireMeshDrawingRow } from '@/lib/db/types';
import { calculateWireMesh } from '@/lib/domain/wire-mesh';
import { wireMeshSvg } from '@/components/wire-mesh-preview';
import { formatDDMMYYYY } from '@/lib/domain/datetime';

function esc(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildWireMeshDrawingHtml(drawing: WireMeshDrawingRow, reference: string) {
  const input = {
    sheetLengthMm: drawing.sheet_length_mm,
    sheetWidthMm: drawing.sheet_width_mm,
    lengthSpacingMm: drawing.length_spacing_mm,
    widthSpacingMm: drawing.width_spacing_mm,
    overhangLeftMm: drawing.overhang_left_mm,
    overhangRightMm: drawing.overhang_right_mm,
    overhangTopMm: drawing.overhang_top_mm,
    overhangBottomMm: drawing.overhang_bottom_mm,
    quantity: drawing.quantity,
  };
  const calculation = calculateWireMesh(input);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Wire Mesh Order Drawing</title><style>
    *{box-sizing:border-box} body{font-family:Arial,"Noto Sans SC",sans-serif;color:#17212b;margin:0;padding:12mm} h1{margin:0;color:#e31e24;font-size:20px}.sub{color:#64748b;font-size:11px;margin-top:3px}.bar{margin:10px 0;background:#e31e24;color:#fff;padding:7px;text-align:center;font-weight:700}.meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0;font-size:10px}.meta b{display:block;color:#64748b;font-size:9px}.drawing{page-break-inside:avoid}.drawing svg{width:100%;height:auto}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;border:1px solid #cbd5e1;margin-top:10px}.summary div{padding:7px;border:1px solid #e2e8f0;font-size:10px}.summary b{display:block;color:#64748b;font-size:8px}.footer{margin-top:10px;color:#64748b;font-size:9px;text-align:center}@page{size:A4 landscape;margin:10mm}@media print{body{padding:0}}
  </style></head><body><h1>ZY STEEL · WIRE MESH ORDER DRAWING</h1><div class="sub">中粤铁网 · Generated ${formatDDMMYYYY(new Date())}</div><div class="bar">WIRE MESH ORDER DRAWING · 钢筋网订单图纸</div><div class="meta"><div><b>CUSTOMER 客户</b>${esc(drawing.customer_name)}</div><div><b>REFERENCE 参考</b>${esc(reference)}</div><div><b>MESH SPECIFICATION 网片规格</b>${esc(drawing.mesh_specification)} · Ø${drawing.wire_diameter_mm} mm</div></div><div class="drawing"><svg viewBox="0 0 1000 480">${wireMeshSvg(input)}</svg></div><div class="summary"><div><b>SHEET LENGTH × WIDTH</b>${drawing.sheet_length_mm} × ${drawing.sheet_width_mm} mm</div><div><b>WIRE COUNTS</b>${calculation.lengthWireCount} across length · ${calculation.widthWireCount} across width</div><div><b>QUANTITY</b>${drawing.quantity} sheets</div><div><b>AREA PER SHEET</b>${calculation.areaPerSheetM2.toFixed(3)} m²</div><div><b>TOTAL AREA</b>${calculation.totalAreaM2.toFixed(3)} m²</div><div><b>SPACING</b>${drawing.length_spacing_mm} × ${drawing.width_spacing_mm} mm</div></div><div class="footer">Dimensions are outside sheet dimensions. Edge overhangs are to the outer wire centreline.</div></body></html>`;
}
