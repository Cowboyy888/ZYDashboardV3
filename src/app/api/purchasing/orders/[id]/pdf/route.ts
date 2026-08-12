import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import { getPurchaseOrder, getPurchaseOrderManualItems, getSupplier } from '@/lib/db/queries';
import { buildPurchaseOrderRows } from '@/lib/domain/purchasing-view';
import { PO_STATUS_LABELS } from '@/lib/domain/purchasing';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { buildPurchaseOrderHtml } from '@/lib/reports/purchase-order-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission('purchasing:view');
  const { id } = await params;
  const locale = await getLocale();

  const po = await getPurchaseOrder(id);
  if (!po) notFound();

  const [supplier, manualItems] = await Promise.all([
    getSupplier(po.supplier_id),
    getPurchaseOrderManualItems(id),
  ]);

  const rows = buildPurchaseOrderRows(
    [po],
    supplier ? [{ id: supplier.id, name: supplier.name }] : [],
  );
  const row = rows[0];
  if (!row) notFound();

  const html = buildPurchaseOrderHtml({
    poNumber: row.poNumber,
    generatedOn: formatDDMMYYYY(businessDate()),
    orderDate: formatDDMMYYYY(row.orderDate),
    currency: row.currency,
    statusLabel: PO_STATUS_LABELS[row.status]?.[locale] ?? row.status,
    supplier: {
      name: row.supplierName,
      contactPerson: supplier?.contact_person ?? null,
      phone: supplier?.phone ?? null,
      address: supplier?.address ?? null,
    },
    notes: row.notes,
    items: manualItems.map((item) => ({
      productName: item.product_name,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unit_price,
      lineTotal: item.line_total,
    })),
  });

  const buffer = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(buffer, `purchase-order-${row.poNumber}.pdf`);
}
