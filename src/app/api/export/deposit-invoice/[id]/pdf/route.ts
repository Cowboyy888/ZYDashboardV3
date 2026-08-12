import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import {
  getDepositInvoice,
  getSalesOrder,
  getSalesOrderItems,
  getSalesOrderItemsDelivered,
  getCustomer,
  getSkus,
  getFamilies,
} from '@/lib/db/queries';
import { buildSalesOrderRows } from '@/lib/domain/sales-view';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { DEPOSIT_INVOICE_STATUS_LABELS } from '@/lib/domain/deposit-invoice';
import { getLocale } from '@/lib/i18n/locale';
import { buildDepositInvoiceHtml } from '@/lib/reports/deposit-invoice-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission('sales:view');
  const { id } = await params;
  const locale = await getLocale();

  const invoice = await getDepositInvoice(id);
  if (!invoice) notFound();

  const so = await getSalesOrder(invoice.sales_order_id);
  if (!so) notFound();

  const [items, customer, skus, families] = await Promise.all([
    getSalesOrderItems(invoice.sales_order_id),
    getCustomer(so.customer_id),
    getSkus(true),
    getFamilies(true),
  ]);
  const delivered = await getSalesOrderItemsDelivered(items.map((i) => i.id));

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

  const html = buildDepositInvoiceHtml({
    invoiceNumber: invoice.invoice_number ?? '—',
    generatedOn: formatDDMMYYYY(businessDate()),
    currency: invoice.currency,
    status: invoice.status,
    statusLabel: DEPOSIT_INVOICE_STATUS_LABELS[invoice.status][locale],
    customer: {
      name: row.customerName,
      contactPerson: customer?.contact_person ?? null,
      phone: customer?.phone ?? null,
      address: customer?.address ?? null,
    },
    so: {
      soNumber: row.soNumber,
      orderDate: formatDDMMYYYY(row.orderDate),
    },
    items: row.items.map((item) => ({
      skuLabel: item.skuLabel,
      unit: item.unit,
      orderedQty: item.orderedQty,
      areaPerSheet: item.areaPerSheet,
      pricePerSqm: item.pricePerSqm,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
    totalOrderAmount: invoice.total_order_amount,
    depositPercentage: invoice.deposit_percentage,
    depositAmount: invoice.deposit_amount,
    remainingBalance: invoice.remaining_balance,
  });

  const buffer = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(buffer, `deposit-invoice-${invoice.invoice_number ?? invoice.id}.pdf`);
}
