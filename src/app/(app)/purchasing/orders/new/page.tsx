import { requirePermission } from '@/lib/auth';
import { getSuppliers } from '@/lib/db/queries';
import { businessDate } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { PurchasingNav } from '../../purchasing-nav';
import { NewPoForm } from './new-po-form';

export const dynamic = 'force-dynamic';

export default async function NewPurchaseOrderPage() {
  await requirePermission('purchasing:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const suppliers = await getSuppliers();

  return (
    <div>
      <PageHeader title={t('pur.newPo')} description={t('pur.newPoDesc')} />
      <PurchasingNav active="orders" />
      <NewPoForm
        suppliers={suppliers.map((s) => ({
          id: s.id,
          name: s.name,
          defaultCurrency: s.default_currency,
        }))}
        today={businessDate()}
      />
    </div>
  );
}
