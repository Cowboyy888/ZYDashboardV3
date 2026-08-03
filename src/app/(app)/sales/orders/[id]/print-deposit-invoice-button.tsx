'use client';
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
 * document, open a bare window, write it in, and trigger print().
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

  function onClick() {
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
    const w = window.open('', '_blank', 'width=900,height=800');
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => {
      try {
        w.print();
      } catch {
        /* user can still print manually */
      }
    }, 500);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Printer className="h-4 w-4" /> {t('sal.printInvoice')}
    </Button>
  );
}
