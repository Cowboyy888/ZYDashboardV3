import { requirePermission } from '@/lib/auth';
import { getInvoiceSettings } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { InvoiceSettingsForm, type InvoiceSettingsView } from './invoice-settings-form';

export const dynamic = 'force-dynamic';

export default async function InvoiceSettingsPage() {
  await requirePermission('invoice:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const row = await getInvoiceSettings();

  const view: InvoiceSettingsView = {
    vatRegistered: row?.vat_registered ?? false,
    vatRate: row?.vat_rate ?? 0.1,
    vatTin: row?.vat_tin ?? '',
    taxInvoicePrefix: row?.tax_invoice_prefix ?? 'ZYS-TAX',
    commercialInvoicePrefix: row?.commercial_invoice_prefix ?? 'ZYS-Q',
  };

  return (
    <div>
      <PageHeader title={t('set.invoice')} description={t('ivc.desc')} />
      <InvoiceSettingsForm settings={view} />
    </div>
  );
}
