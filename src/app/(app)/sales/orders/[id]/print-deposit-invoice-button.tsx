'use client';
import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import { businessDate, formatDDMMYYYY } from '@/lib/domain/datetime';
import { DEPOSIT_INVOICE_STATUS_LABELS } from '@/lib/domain/deposit-invoice';
import { buildDepositInvoiceHtml } from '@/lib/reports/deposit-invoice-html';
import type { SalesOrderRow } from '@/lib/domain/sales-view';
import type { DepositInvoiceRow, CustomerRow } from '@/lib/db/types';

/**
 * Print-to-PDF for a deposit invoice — same trigger shape as the inquiry
 * report (inquiries-client.tsx's downloadPdf): build the self-contained HTML
 * document, open a bare window synchronously in the click gesture, and write
 * it in. The document itself carries a "Print / Save as PDF" button, so
 * nothing here needs to auto-trigger print() (which, from a timer callback,
 * mobile browsers can silently block — see deposit-invoice-html.ts).
 */
export function PrintDepositInvoiceButton({
  invoice,
  row,
  customer,
}: {
  invoice: DepositInvoiceRow;
  row: SalesOrderRow;
  customer: CustomerRow | null;
}) {
  const { t, locale } = useT();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) {
      setError(t('common.popupBlocked'));
      return;
    }
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
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onClick}>
        <Printer className="h-4 w-4" /> {t('sal.printInvoice')}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
