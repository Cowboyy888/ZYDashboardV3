import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth';
import {
  getQuotation,
  getQuotationItems,
  getSalesOrdersByQuotationIds,
  getInvoiceSettings,
} from '@/lib/db/queries';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { DOCUMENT_KINDS, type DocumentKind } from '@/lib/domain/quotation';
import { buildQuotationDocHtml, type DocLine } from '@/lib/reports/quotation-doc-html';
import { renderHtmlToPdf, pdfResponse } from '@/lib/reports/pdf';

export const dynamic = 'force-dynamic';

function isDocumentKind(v: string | null): v is DocumentKind {
  return !!v && (DOCUMENT_KINDS as readonly string[]).includes(v);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermission('sales:view');
  const { id } = await params;

  const kind = new URL(request.url).searchParams.get('kind');
  if (!isDocumentKind(kind)) {
    return new Response('Invalid document kind', { status: 400 });
  }

  const [quotation, items, linkedOrders, invoiceSettings] = await Promise.all([
    getQuotation(id),
    getQuotationItems(id),
    getSalesOrdersByQuotationIds([id]),
    getInvoiceSettings(),
  ]);
  if (!quotation) notFound();

  const lines: DocLine[] = items.map((it) => ({
    description: it.description,
    wireDia: it.wire_dia,
    steelGrade: it.steel_grade,
    unit: it.unit,
    unitPrice: Number(it.unit_price),
    quantity: Number(it.quantity),
  }));

  const docNo =
    kind === 'quotation'
      ? quotation.quotation_no
      : kind === 'deposit'
        ? quotation.deposit_no
        : quotation.balance_no;
  const issuedIso =
    (kind === 'quotation'
      ? quotation.quotation_issued_on
      : kind === 'deposit'
        ? quotation.deposit_issued_on
        : quotation.balance_issued_on) ?? businessDate();

  const html = buildQuotationDocHtml({
    kind,
    docNo: docNo ?? '',
    issuedOn: formatDDMMYYYY(issuedIso),
    issuedOnIso: issuedIso,
    customerName: quotation.customer_name,
    contact: quotation.contact,
    projectSite: quotation.project_site,
    currency: quotation.currency,
    validDays: quotation.valid_days,
    depositPct: Number(quotation.deposit_pct),
    lines,
    refQuotationNo: quotation.quotation_no,
    refDepositNo: quotation.deposit_no,
    orderNo: linkedOrders[0]?.so_number ?? null,
    pricingBasis: quotation.pricing_basis,
    // Read from this quotation's own snapshot, never live invoice_settings —
    // that's the whole point of snapshotting (see 0043_invoice_vat.sql). The
    // TIN itself isn't snapshotted per-quotation (VAT TIN essentially never
    // changes once a company registers), so it's the current settings value.
    vatRegistered: quotation.vat_registered_snapshot,
    vatRate: Number(quotation.vat_rate_snapshot),
    vatTin: quotation.vat_registered_snapshot ? (invoiceSettings?.vat_tin ?? null) : null,
  });

  const buffer = await renderHtmlToPdf(html, { baseUrl: new URL(request.url).origin });
  return pdfResponse(buffer, `${kind}-${docNo ?? quotation.id}.pdf`);
}
