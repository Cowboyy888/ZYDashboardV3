import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import {
  getSalesOrder,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomer,
  getSkus,
  getFamilies,
} from '@/lib/db/queries';
import { buildSalesOrderRows } from '@/lib/domain/sales-view';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { buildSalesOrderHtml } from '@/lib/reports/sales-order-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission('sales:view');
  const { id } = await params;
  const locale = await getLocale();

  const so = await getSalesOrder(id);
  if (!so) notFound();

  const [items, customer] = await Promise.all([
    getSalesOrderItems(id),
    getCustomer(so.customer_id),
  ]);
  // One order's worth of SKUs/families, not the whole catalog — see getSkus'
  // JSDoc.
  const skus = await getSkus(true, Array.from(new Set(items.map((i) => i.sku_id))));
  const [families, delivered] = await Promise.all([
    getFamilies(true, Array.from(new Set(skus.map((s) => s.family_id)))),
    getSalesOrderItemsDelivered(items.map((i) => i.id)),
  ]);

  const rows = buildSalesOrderRows(
    [so],
    items,
    delivered,
    customer ? [{ id: customer.id, name: customer.name }] : [],
    skus,
    families,
    businessDate(),
    locale,
  );
  const row = rows[0];
  if (!row) notFound();

  const html = buildSalesOrderHtml({
    soNumber: row.soNumber,
    generatedOn: formatDDMMYYYY(businessDate()),
    orderDate: formatDDMMYYYY(row.orderDate),
    expectedDeliveryDate: row.expectedDeliveryDate
      ? formatDDMMYYYY(row.expectedDeliveryDate)
      : null,
    currency: row.currency,
    customer: {
      name: row.customerName,
      contactPerson: customer?.contact_person ?? null,
      phone: customer?.phone ?? null,
      address: customer?.address ?? null,
    },
    paymentTerms: customer?.payment_terms ?? null,
    notes: so.notes,
    items: row.items.map((item) => ({
      skuLabel: item.skuLabel,
      unit: item.unit,
      unitPrice: item.unitPrice,
      orderedQty: item.orderedQty,
      lineTotal: item.lineTotal,
    })),
    grandTotal: row.grandTotal,
  });

  const buffer = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(buffer, `sales-order-${row.soNumber}.pdf`);
}
