import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import type { DepositInvoiceRow } from '@/lib/db/types';

/**
 * Opens the branded deposit or balance invoice PDF (rendered server-side) in
 * a new tab. Both documents come from the same deposit_invoices row — kind
 * only changes the title/emphasis (see deposit-invoice-html.ts), not the
 * underlying data or numbering.
 */
export function PrintDepositInvoiceButton({
  invoice,
  kind = 'deposit',
}: {
  invoice: DepositInvoiceRow;
  kind?: 'deposit' | 'balance';
}) {
  const { t } = useT();

  return (
    <Button asChild variant="outline" size="sm">
      <a
        href={`/api/export/deposit-invoice/${invoice.id}/pdf?kind=${kind}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FileText className="h-4 w-4" />{' '}
        {kind === 'deposit' ? t('sal.printInvoice') : t('sal.printBalanceInvoice')}
      </a>
    </Button>
  );
}
