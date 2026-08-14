import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/components/i18n-provider';

/** Opens one payment receipt's branded PDF (rendered server-side) in a new tab. */
export function PrintPaymentReceiptButton({ receiptId }: { receiptId: string }) {
  const { t } = useT();

  return (
    <Button asChild variant="ghost" size="sm">
      <a
        href={`/api/export/payment-receipt/${receiptId}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <FileText className="h-4 w-4" /> {t('sal.viewReceiptPdf')}
      </a>
    </Button>
  );
}
