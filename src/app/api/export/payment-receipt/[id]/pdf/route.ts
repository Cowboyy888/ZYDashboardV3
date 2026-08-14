import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import {
  getPaymentReceipt,
  getPaymentReceiptsForSo,
  getDepositInvoice,
  getSalesOrder,
  getCustomer,
  getProfiles,
} from '@/lib/db/queries';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { computeBalanceDue } from '@/lib/domain/payment-receipt';
import { buildPaymentReceiptHtml } from '@/lib/reports/payment-receipt-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission('sales:view');
  const { id } = await params;

  const receipt = await getPaymentReceipt(id);
  if (!receipt) notFound();

  const [invoice, so, allReceipts, profiles] = await Promise.all([
    getDepositInvoice(receipt.deposit_invoice_id),
    getSalesOrder(receipt.sales_order_id),
    getPaymentReceiptsForSo(receipt.sales_order_id),
    getProfiles(),
  ]);
  if (!invoice || !so) notFound();

  const customer = await getCustomer(so.customer_id);

  // Balance as of this receipt: sum every receipt up to and including it,
  // in the order they were actually recorded — not the SO's current total.
  const chronological = [...allReceipts].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const uptoIdx = chronological.findIndex((r) => r.id === receipt.id);
  const totalPaidToDate = chronological
    .slice(0, uptoIdx + 1)
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const balanceRemaining = computeBalanceDue(invoice.total_order_amount, totalPaidToDate);

  const profileName = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));

  const html = buildPaymentReceiptHtml({
    receiptNumber: receipt.receipt_number ?? '—',
    receiptType: receipt.receipt_type,
    paidDate: formatDDMMYYYY(receipt.paid_date),
    currency: invoice.currency,
    amount: Number(receipt.amount),
    method: receipt.method,
    notes: receipt.notes,
    customer: {
      name: customer?.name ?? '—',
      contactPerson: customer?.contact_person ?? null,
      phone: customer?.phone ?? null,
      address: customer?.address ?? null,
    },
    so: {
      soNumber: so.so_number ?? '—',
      orderDate: formatDDMMYYYY(so.order_date),
    },
    totalOrderAmount: invoice.total_order_amount,
    totalPaidToDate,
    balanceRemaining,
    recordedBy: (receipt.recorded_by && profileName.get(receipt.recorded_by)) || null,
  });

  const buffer = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(buffer, `payment-receipt-${receipt.receipt_number ?? receipt.id}.pdf`);
}
