import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';
import type { DepositInvoiceRow } from '@/lib/db/types';

/** Downloads the branded deposit invoice PDF, rendered server-side. */
export function PrintDepositInvoiceButton({ invoice }: { invoice: DepositInvoiceRow }) {
  const { t } = useT();

  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/export/deposit-invoice/${invoice.id}/pdf`}>
        <Download className="h-4 w-4" /> {t('sal.printInvoice')}
      </a>
    </Button>
  );
}
