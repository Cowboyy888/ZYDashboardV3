import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { getQuotation, getSalesOrder, getWireMeshDrawing } from '@/lib/db/queries';
import { buildWireMeshDrawingHtml } from '@/lib/reports/wire-mesh-drawing-html';
import { pdfResponse, renderHtmlToPdf } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission('sales:view');
  const { id } = await params;
  const drawing = await getWireMeshDrawing(id);
  if (!drawing) notFound();
  const reference = drawing.quotation_id
    ? await getQuotation(drawing.quotation_id)
    : await getSalesOrder(drawing.sales_order_id!);
  if (!reference) notFound();
  const number = 'quotation_no' in reference ? reference.quotation_no : reference.so_number;
  const html = buildWireMeshDrawingHtml(drawing, number ?? drawing.id.slice(0, 8));
  const pdf = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(pdf, `wire-mesh-drawing-${drawing.id}.pdf`);
}
