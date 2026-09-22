import { requirePermission } from '@/lib/auth';
import { getInquiryCustomerTypes } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { CustomerTypesManager } from './customer-types-manager';

export const dynamic = 'force-dynamic';

export default async function CustomerTypesSettingsPage() {
  await requirePermission('inquiries:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const customerTypes = await getInquiryCustomerTypes(true);
  return (
    <div>
      <PageHeader title={t('set.customerTypes')} description={t('set.customerTypesDesc')} />
      <CustomerTypesManager customerTypes={customerTypes} />
    </div>
  );
}
